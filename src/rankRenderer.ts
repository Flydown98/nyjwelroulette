import type { Marble } from './marble';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

type DrawRect = { x: number; y: number; w: number; h: number };

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private fontHeight = 24;
  private _userMoved = 0;
  private _currentWinner = -1;
  private maxY = 0;

  private overlayCurrentY = 0;
  private overlayTargetY = 0;
  private overlayMaxY = 0;
  private overlayVisible = false;
  private overlayPanelRect: DrawRect | null = null;
  private overlayListRect: DrawRect | null = null;

  private sidePanelRect: DrawRect | null = null;
  private sideListRect: DrawRect | null = null;

  private dragMode: 'overlay' | 'side' | null = null;
  private dragStartY = 0;
  private dragStartScroll = 0;

  private winners: Marble[] = [];
  private marbles: Marble[] = [];
  private winnerRank: number = -1;
  private messageHandler?: (msg: string) => void;

  private pointInRect(point: { x: number; y: number }, rect: DrawRect | null): boolean {
    if (!rect) return false;
    return point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.w && point.y <= rect.y + rect.h;
  }

  private clampScroll(value: number, max: number): number {
    return Math.max(0, Math.min(max, value));
  }

  private drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  private drawFittedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    maxSize: number,
    minSize: number,
    align: CanvasTextAlign = 'left'
  ) {
    let size = maxSize;
    ctx.textAlign = align;
    ctx.font = `bold ${size}px sans-serif`;

    while (size > minSize && ctx.measureText(text).width > maxWidth) {
      size -= 1;
      ctx.font = `bold ${size}px sans-serif`;
    }

    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }

    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
      clipped = clipped.slice(0, -1);
    }
    ctx.fillText(`${clipped}…`, x, y);
  }

  @bound
  onWheel(e: WheelEvent) {
    e.preventDefault();

    if (this.overlayVisible) {
      this.overlayTargetY = this.clampScroll(this.overlayTargetY + e.deltaY, this.overlayMaxY);
      this.overlayCurrentY = this.overlayTargetY;
      return;
    }

    this._targetY = this.clampScroll(this._targetY + e.deltaY, this.maxY);
    this._userMoved = 2000;
  }

  @bound
  onMouseDown(e?: MouseEventArgs) {
    if (!e) return;

    if (this.overlayVisible && this.pointInRect(e, this.overlayPanelRect)) {
      this.dragMode = 'overlay';
      this.dragStartY = e.y;
      this.dragStartScroll = this.overlayTargetY;
      return;
    }

    if (this.pointInRect(e, this.sidePanelRect)) {
      this.dragMode = 'side';
      this.dragStartY = e.y;
      this.dragStartScroll = this._targetY;
    }
  }

  @bound
  onMouseMove(e?: MouseEventArgs) {
    if (!e || !this.dragMode) return;

    const delta = this.dragStartY - e.y;
    if (this.dragMode === 'overlay') {
      this.overlayTargetY = this.clampScroll(this.dragStartScroll + delta, this.overlayMaxY);
      this.overlayCurrentY = this.overlayTargetY;
    } else {
      this._targetY = this.clampScroll(this.dragStartScroll + delta, this.maxY);
      this._currentY = this._targetY;
      this._userMoved = 2000;
    }
  }

  @bound
  onMouseUp() {
    this.dragMode = null;
  }

  @bound
  onDblClick(e?: MouseEventArgs) {
    if (e) {
      if (navigator.clipboard) {
        const tsv: string[] = [];
        this.winners.forEach((m, index) => {
          tsv.push([String(index + 1), m.name, '선정'].join('\t'));
        });

        tsv.unshift(['순번', '이름', '상태'].join('\t'));

        navigator.clipboard.writeText(tsv.join('\n')).then(() => {
          if (this.messageHandler) {
            this.messageHandler('선정자 명단이 복사되었습니다');
          }
        });
      }
    }
  }

  onMessage(func: (msg: string) => void) {
    this.messageHandler = func;
  }

  render(
    ctx: CanvasRenderingContext2D,
    params: RenderParameters,
    width: number,
    height: number
  ) {
    const { winners, marbles, winnerRank, winner, theme } = params;
    const targetCount = Math.min(winnerRank + 1, winners.length + marbles.length);
    this.overlayVisible = !!winner;

    this.winners = winners;
    this.marbles = marbles;
    this.winnerRank = winnerRank;

    this.renderSidePanel(ctx, params, width, height, targetCount);

    if (winner) {
      this.renderSelectedOverlay(ctx, params, width, height, targetCount);
    } else {
      this.overlayPanelRect = null;
      this.overlayListRect = null;
      this.overlayTargetY = 0;
      this.overlayCurrentY = 0;
    }
  }

  private renderSidePanel(
    ctx: CanvasRenderingContext2D,
    { winners, theme }: RenderParameters,
    width: number,
    height: number,
    targetCount: number
  ) {
    const panelWidth = 270;
    const startX = width - 20;
    const panelX = width - panelWidth - 10;
    const panelY = 10;
    const panelH = Math.min(height - 20, 84 + Math.min(winners.length, 12) * this.fontHeight);
    const listY = panelY + 78;
    const listH = height - listY - 14;
    const startY = Math.max(0, this._currentY);

    this.sidePanelRect = { x: panelX, y: panelY, w: panelWidth, h: height - 20 };
    this.sideListRect = { x: panelX, y: listY, w: panelWidth, h: listH };
    this.maxY = Math.max(0, winners.length * this.fontHeight - listH + 34);
    this._currentWinner = winners.length;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    this.drawRoundRect(ctx, panelX, panelY, panelWidth, Math.min(height - 20, 92 + Math.min(winners.length, 16) * this.fontHeight), 16);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.stroke();

    ctx.font = 'bold 18pt sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
    ctx.fillText('선정 현황', startX, 38);

    ctx.font = 'bold 14pt sans-serif';
    ctx.fillStyle = winners.length >= targetCount ? '#ffe66d' : '#8dc63f';
    ctx.fillText(`${winners.length} / ${targetCount}명`, startX, 64);

    ctx.font = '11pt sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.58)';
    ctx.fillText('휠·드래그로 보기', startX, 85);

    ctx.beginPath();
    ctx.rect(panelX, listY, panelWidth, listH);
    ctx.clip();

    ctx.translate(0, -startY);
    ctx.font = 'bold 13pt sans-serif';
    if (theme.rankStroke) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.80)';
    }

    if (winners.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.fillText('아직 선정자가 없습니다', startX, listY + 24);
    }

    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.fontHeight;
      if (y >= startY - this.fontHeight && y <= startY + listH + this.fontHeight) {
        const label = `${rank + 1}번째 선정 · ${marble.name}`;
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness})`;
        if (theme.rankStroke) {
          ctx.strokeText(label, startX, listY + 24 + y);
        }
        ctx.fillText(label, startX, listY + 24 + y);
      }
    });
    ctx.restore();

    if (this.maxY > 0) {
      ctx.save();
      const barH = Math.max(28, listH * (listH / (listH + this.maxY)));
      const barY = listY + (listH - barH) * (this._currentY / this.maxY);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(panelX + 6, barY, 4, barH);
      ctx.restore();
    }
  }

  private renderSelectedOverlay(
    ctx: CanvasRenderingContext2D,
    { winners, winnerRank, theme }: RenderParameters,
    width: number,
    height: number,
    targetCount: number
  ) {
    const selectedCount = Math.min(winners.length, winnerRank + 1);
    const selected = winners.slice(0, selectedCount);

    const panelW = Math.min(width * 0.82, 1220);
    const panelH = Math.min(height * 0.76, 720);
    const panelX = (width - panelW) / 2;
    const panelY = Math.max(26, (height - panelH) / 2);

    this.overlayPanelRect = { x: panelX, y: panelY, w: panelW, h: panelH };

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.46)';
    ctx.fillRect(0, 0, width, height);

    this.drawRoundRect(ctx, panelX, panelY, panelW, panelH, 34);
    ctx.fillStyle = 'rgba(8, 12, 18, 0.93)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(141, 198, 63, 0.78)';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.86)';
    ctx.fillStyle = theme.winnerText;
    ctx.font = 'bold 44px sans-serif';
    const title = `선착순 ${targetCount}명 선정 완료`;
    ctx.strokeText(title, panelX + panelW / 2, panelY + 70);
    ctx.fillText(title, panelX + panelW / 2, panelY + 70);

    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.fillText('명단이 길면 마우스 휠 또는 드래그로 확인하세요 · 더블클릭하면 명단 복사', panelX + panelW / 2, panelY + 104);

    const listX = panelX + 42;
    const listY = panelY + 128;
    const listW = panelW - 84;
    const listH = panelH - 158;
    this.overlayListRect = { x: listX, y: listY, w: listW, h: listH };

    const columns = selectedCount <= 12 ? 1 : selectedCount <= 30 ? 2 : 3;
    const gapX = 18;
    const gapY = 10;
    const cardW = (listW - gapX * (columns - 1)) / columns;
    const cardH = selectedCount <= 12 ? 58 : 52;
    const rows = Math.ceil(selectedCount / columns);
    const contentH = rows * cardH + Math.max(0, rows - 1) * gapY;
    this.overlayMaxY = Math.max(0, contentH - listH);
    this.overlayTargetY = this.clampScroll(this.overlayTargetY, this.overlayMaxY);
    this.overlayCurrentY = this.clampScroll(this.overlayCurrentY, this.overlayMaxY);

    ctx.save();
    ctx.beginPath();
    ctx.rect(listX, listY, listW, listH);
    ctx.clip();
    ctx.translate(0, -this.overlayCurrentY);

    selected.forEach((marble, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const x = listX + col * (cardW + gapX);
      const y = listY + row * (cardH + gapY);
      const hueColor = `hsl(${marble.hue} 100% ${theme.marbleLightness})`;

      if (y + cardH < listY + this.overlayCurrentY - 20 || y > listY + this.overlayCurrentY + listH + 20) {
        return;
      }

      this.drawRoundRect(ctx, x, y, cardW, cardH, 16);
      ctx.fillStyle = index === selectedCount - 1 ? 'rgba(255, 230, 110, 0.17)' : 'rgba(255, 255, 255, 0.10)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = index === selectedCount - 1 ? 'rgba(255, 230, 110, 0.96)' : 'rgba(255, 255, 255, 0.18)';
      ctx.stroke();

      const badgeSize = Math.min(36, cardH - 10);
      const badgeX = x + 18 + badgeSize / 2;
      const badgeY = y + cardH / 2;
      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = hueColor;
      ctx.fill();

      ctx.font = `bold ${Math.max(14, badgeSize * 0.48)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
      ctx.fillText(String(index + 1), badgeX, badgeY + badgeSize * 0.17);

      const nameX = x + 18 + badgeSize + 16;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'white';
      this.drawFittedText(ctx, marble.name, nameX, y + cardH / 2 + cardH * 0.16, cardW - (nameX - x) - 16, 30, 17, 'left');
    });
    ctx.restore();

    if (this.overlayMaxY > 0) {
      const barW = 8;
      const barH = Math.max(46, listH * (listH / (listH + this.overlayMaxY)));
      const barY = listY + (listH - barH) * (this.overlayCurrentY / this.overlayMaxY);
      this.drawRoundRect(ctx, listX + listW - barW - 4, barY, barW, barH, 6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fill();
    }

    ctx.restore();
  }

  update(deltaTime: number) {
    if (this.overlayVisible && this.overlayCurrentY !== this.overlayTargetY) {
      this.overlayCurrentY += (this.overlayTargetY - this.overlayCurrentY) * (deltaTime / 120);
      if (Math.abs(this.overlayCurrentY - this.overlayTargetY) < 1) {
        this.overlayCurrentY = this.overlayTargetY;
      }
    }

    if (this._currentWinner === -1) {
      return;
    }
    if (this._userMoved > 0 || this.dragMode === 'side') {
      this._userMoved -= deltaTime;
    } else {
      this._targetY = Math.max(0, this._currentWinner * this.fontHeight - this.fontHeight * 5);
    }
    this._targetY = this.clampScroll(this._targetY, this.maxY);
    if (this._currentY !== this._targetY) {
      this._currentY += (this._targetY - this._currentY) * (deltaTime / 250);
    }
    if (Math.abs(this._currentY - this._targetY) < 1) {
      this._currentY = this._targetY;
    }
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
