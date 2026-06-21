import type { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Themes } from './data/constants';
import type { StageDef } from './data/maps';
import type { GameObject } from './gameObject';
import { KeywordService } from './keywordService';
import type { Marble } from './marble';
import type { ParticleManager } from './particleManager';
import type { ColorTheme } from './types/ColorTheme';
import type { MapEntityState } from './types/MapEntity.type';
import type { VectorLike } from './types/VectorLike';
import type { UIObject } from './UIObject';

export type RenderParameters = {
  camera: Camera;
  stage: StageDef;
  entities: MapEntityState[];
  marbles: Marble[];
  winners: Marble[];
  particleManager: ParticleManager;
  effects: GameObject[];
  winnerRank: number;
  winner: Marble | null;
  size: VectorLike;
  theme: ColorTheme;
};

export class RouletteRenderer {
  protected _canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  public sizeFactor = 1;

  protected _images: { [key: string]: HTMLImageElement } = {};
  protected _brandImage?: HTMLImageElement;
  protected _theme: ColorTheme = Themes.dark;
  protected _keywordService: KeywordService;

  constructor() {
    this._keywordService = this.createKeywordService();
  }

  protected createKeywordService(): KeywordService {
    return new KeywordService();
  }

  get width() {
    return this._canvas.width;
  }

  get height() {
    return this._canvas.height;
  }

  get canvas() {
    return this._canvas;
  }

  set theme(value: ColorTheme) {
    this._theme = value;
  }

  async init() {
    await Promise.all([this._load(), this._keywordService.init()]);

    this._canvas = document.createElement('canvas');
    this._canvas.width = canvasWidth;
    this._canvas.height = canvasHeight;
    this.ctx = this._canvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    document.body.appendChild(this._canvas);

    const resizing = (entries?: ResizeObserverEntry[]) => {
      const realSize = entries ? entries[0].contentRect : this._canvas.getBoundingClientRect();
      const width = Math.max(realSize.width / 2, 640);
      const height = (width / realSize.width) * realSize.height;
      this._canvas.width = width;
      this._canvas.height = height;
      this.sizeFactor = width / realSize.width;
    };

    const resizeObserver = new ResizeObserver(resizing);

    resizeObserver.observe(this._canvas);
    resizing();
  }

  private async _loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((rs) => {
      const img = new Image();
      img.addEventListener('load', () => {
        rs(img);
      });
      img.src = url;
    });
  }

  private async _loadOptionalImage(url: string): Promise<HTMLImageElement | undefined> {
    return new Promise((rs) => {
      const img = new Image();
      img.addEventListener('load', () => {
        rs(img);
      });
      img.addEventListener('error', () => {
        rs(undefined);
      });
      img.src = url;
    });
  }

  private async _load(): Promise<void> {
    const loadPromises = [
      { name: '챔루', imgUrl: new URL('../assets/images/chamru.png', import.meta.url) },
      { name: '쿠빈', imgUrl: new URL('../assets/images/kubin.png', import.meta.url) },
      { name: '꽉변', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
      { name: '꽉변호사', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
      { name: '꽉 변호사', imgUrl: new URL('../assets/images/kkwak.png', import.meta.url) },
      { name: '주누피', imgUrl: new URL('../assets/images/junyoop.png', import.meta.url) },
      { name: '왈도쿤', imgUrl: new URL('../assets/images/waldokun.png', import.meta.url) },
    ].map(({ name, imgUrl }) => {
      return (async () => {
        this._images[name] = await this._loadImage(imgUrl.toString());
      })();
    });

    loadPromises.push(
      (async () => {
        await this._loadImage(new URL('../assets/images/ff.svg', import.meta.url).toString());
      })()
    );

    loadPromises.push(
      (async () => {
        this._brandImage = await this._loadOptionalImage(new URL('../assets/nyjwel-ci.png', import.meta.url).toString());
      })()
    );

    await Promise.all(loadPromises);
  }

  private getMarbleImage(name: string): CanvasImageSource | undefined {
    // Priority 1: Hardcoded images
    if (this._images[name]) {
      return this._images[name];
    }
    // Priority 2: Keyword sprites from API
    return this._keywordService.getSprite(name);
  }

  protected onBeforeEntities(): void {}
  protected onAfterScene(): void {}

  render(renderParameters: RenderParameters, uiObjects: UIObject[]) {
    this._theme = renderParameters.theme;
    this.ctx.fillStyle = this._theme.background;
    this.ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
    this.renderBrandWatermark();

    this.ctx.save();
    this.ctx.scale(initialZoom, initialZoom);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = '0.4pt sans-serif';
    this.ctx.lineWidth = 3 / (renderParameters.camera.zoom + initialZoom);
    renderParameters.camera.renderScene(this.ctx, () => {
      this.onBeforeEntities();
      this.renderEntities(renderParameters.entities);
      this.renderEffects(renderParameters);
      this.renderMarbles(renderParameters);
    });
    this.ctx.restore();
    this.onAfterScene();

    uiObjects.forEach((obj) => obj.render(this.ctx, renderParameters, this._canvas.width, this._canvas.height));
    renderParameters.particleManager.render(this.ctx);
    this.renderWinner(renderParameters);
  }

  private renderEntities(entities: MapEntityState[]) {
    this.ctx.save();
    entities.forEach((entity) => {
      const transform = this.ctx.getTransform();
      this.ctx.translate(entity.x, entity.y);
      this.ctx.rotate(entity.angle);
      this.ctx.fillStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].fill;
      this.ctx.strokeStyle = entity.shape.color ?? this._theme.entity[entity.shape.type].outline;
      this.ctx.shadowBlur = this._theme.entity[entity.shape.type].bloomRadius;
      this.ctx.shadowColor =
        entity.shape.bloomColor ?? entity.shape.color ?? this._theme.entity[entity.shape.type].bloom;
      const shape = entity.shape;
      switch (shape.type) {
        case 'polyline':
          if (shape.points.length > 0) {
            this.ctx.beginPath();
            this.ctx.moveTo(shape.points[0][0], shape.points[0][1]);
            for (let i = 1; i < shape.points.length; i++) {
              this.ctx.lineTo(shape.points[i][0], shape.points[i][1]);
            }
            this.ctx.stroke();
          }
          break;
        case 'box': {
          const w = shape.width * 2;
          const h = shape.height * 2;
          this.ctx.rotate(shape.rotation);
          this.ctx.fillRect(-w / 2, -h / 2, w, h);
          this.ctx.strokeRect(-w / 2, -h / 2, w, h);
          break;
        }
        case 'circle':
          this.ctx.beginPath();
          this.ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
          this.ctx.stroke();
          break;
      }

      this.ctx.setTransform(transform);
    });
    this.ctx.restore();
  }

  private renderEffects({ effects, camera }: RenderParameters) {
    effects.forEach((effect) => effect.render(this.ctx, camera.zoom * initialZoom, this._theme));
  }

  private renderMarbles({ marbles, camera, winnerRank, winners, size }: RenderParameters) {
    const winnerIndex = winnerRank - winners.length;

    const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };
    marbles.forEach((marble, i) => {
      marble.render(
        this.ctx,
        camera.zoom * initialZoom,
        i === winnerIndex,
        false,
        this.getMarbleImage(marble.name),
        viewPort,
        this._theme
      );
    });
  }

  private drawRoundRect(x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    this.ctx.beginPath();
    this.ctx.moveTo(x + radius, y);
    this.ctx.lineTo(x + w - radius, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    this.ctx.lineTo(x + w, y + h - radius);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    this.ctx.lineTo(x + radius, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    this.ctx.lineTo(x, y + radius);
    this.ctx.quadraticCurveTo(x, y, x + radius, y);
    this.ctx.closePath();
  }

  private renderBrandWatermark() {
    if (!this._brandImage) return;

    const imageRatio = this._brandImage.height / this._brandImage.width;
    const targetW = Math.min(this._canvas.width * 0.34, 520);
    const targetH = targetW * imageRatio;
    const x = (this._canvas.width - targetW) / 2;
    const centerY = this._canvas.height * 0.68;
    const y = centerY - targetH / 2;

    this.ctx.save();
    this.ctx.globalAlpha = 0.13;
    this.ctx.shadowBlur = 18;
    this.ctx.shadowColor = 'rgba(141, 198, 63, 0.28)';
    this.ctx.drawImage(this._brandImage, x, y, targetW, targetH);
    this.ctx.restore();
  }

  private renderWinner({ winner, winners, winnerRank, theme }: RenderParameters) {
    if (!winner) return;

    const selectedCount = Math.min(winners.length, winnerRank + 1);
    const selected = winners.slice(0, selectedCount);

    this.ctx.save();

    // Dimmed background so the selected list is clearly emphasized.
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
    this.ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);

    const panelW = Math.min(this._canvas.width * 0.78, 1180);
    const panelH = Math.min(this._canvas.height * 0.72, selectedCount > 20 ? 650 : selectedCount > 10 ? 580 : 500);
    const panelX = (this._canvas.width - panelW) / 2;
    const panelY = Math.max(36, (this._canvas.height - panelH) / 2);

    this.drawRoundRect(panelX, panelY, panelW, panelH, 34);
    this.ctx.fillStyle = 'rgba(8, 12, 18, 0.88)';
    this.ctx.fill();
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = 'rgba(141, 198, 63, 0.78)';
    this.ctx.stroke();

    // Small brand watermark inside the result panel.
    if (this._brandImage) {
      const markW = Math.min(panelW * 0.42, 420);
      const markH = markW * (this._brandImage.height / this._brandImage.width);
      this.ctx.save();
      this.ctx.globalAlpha = 0.08;
      this.ctx.drawImage(this._brandImage, panelX + panelW - markW - 34, panelY + 28, markW, markH);
      this.ctx.restore();
    }

    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'alphabetic';
    this.ctx.lineWidth = 5;
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.86)';
    this.ctx.fillStyle = theme.winnerText;
    this.ctx.font = 'bold 46px sans-serif';
    const title = `선착순 ${selectedCount}명 선정 완료`;
    this.ctx.strokeText(title, panelX + panelW / 2, panelY + 74);
    this.ctx.fillText(title, panelX + panelW / 2, panelY + 74);

    this.ctx.font = 'bold 22px sans-serif';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    this.ctx.fillText('선정자 명단', panelX + panelW / 2, panelY + 112);

    const columns = selectedCount <= 8 ? 1 : selectedCount <= 20 ? 2 : 3;
    const rows = Math.ceil(selectedCount / columns);
    const gapX = 18;
    const gapY = selectedCount > 20 ? 8 : 12;
    const listX = panelX + 44;
    const listY = panelY + 148;
    const listW = panelW - 88;
    const listH = panelH - 184;
    const cardW = (listW - gapX * (columns - 1)) / columns;
    const cardH = Math.min(56, Math.max(34, (listH - gapY * Math.max(0, rows - 1)) / rows));

    selected.forEach((marble, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const x = listX + col * (cardW + gapX);
      const y = listY + row * (cardH + gapY);
      const hueColor = `hsl(${marble.hue} 100% ${theme.marbleLightness})`;

      this.drawRoundRect(x, y, cardW, cardH, 16);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
      this.ctx.fill();
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = index === selectedCount - 1 ? 'rgba(255, 230, 110, 0.95)' : 'rgba(255, 255, 255, 0.18)';
      this.ctx.stroke();

      const badgeSize = Math.min(34, cardH - 10);
      const badgeX = x + 18 + badgeSize / 2;
      const badgeY = y + cardH / 2;
      this.ctx.beginPath();
      this.ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
      this.ctx.fillStyle = hueColor;
      this.ctx.fill();

      this.ctx.font = `bold ${Math.max(14, badgeSize * 0.48)}px sans-serif`;
      this.ctx.textAlign = 'center';
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      this.ctx.fillText(String(index + 1), badgeX, badgeY + badgeSize * 0.17);

      const nameX = x + 18 + badgeSize + 16;
      this.ctx.textAlign = 'left';
      this.ctx.fillStyle = 'white';
      this.ctx.font = `bold ${Math.min(30, Math.max(18, cardH * 0.48))}px sans-serif`;
      this.ctx.fillText(marble.name, nameX, y + cardH / 2 + cardH * 0.16);
    });

    this.ctx.restore();
  }
}
