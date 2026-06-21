import type { Marble } from './marble';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { MouseEventArgs, UIObject } from './UIObject';
import { bound } from './utils/bound.decorator';

export class RankRenderer implements UIObject {
  private _currentY = 0;
  private _targetY = 0;
  private fontHeight = 24;
  private _userMoved = 0;
  private _currentWinner = -1;
  private maxY = 0;
  private winners: Marble[] = [];
  private marbles: Marble[] = [];
  private winnerRank: number = -1;
  private messageHandler?: (msg: string) => void;

  @bound
  onWheel(e: WheelEvent) {
    this._targetY += e.deltaY;
    if (this._targetY > this.maxY) {
      this._targetY = this.maxY;
    }
    this._userMoved = 2000;
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
    { winners, marbles, winnerRank, theme }: RenderParameters,
    width: number,
    height: number
  ) {
    const targetCount = Math.min(winnerRank + 1, winners.length + marbles.length);
    const panelWidth = 245;
    const startX = width - 18;
    const startY = Math.max(-this.fontHeight, this._currentY - height / 2);
    this.maxY = Math.max(0, winners.length * this.fontHeight + this.fontHeight * 2);
    this._currentWinner = winners.length;

    this.winners = winners;
    this.marbles = marbles;
    this.winnerRank = winnerRank;

    ctx.save();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
    ctx.fillRect(width - panelWidth - 8, 8, panelWidth, Math.min(height - 16, 74 + winners.length * this.fontHeight));

    ctx.font = 'bold 18pt sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.fillText('선정 현황', startX, 36);

    ctx.font = 'bold 14pt sans-serif';
    ctx.fillStyle = winners.length >= targetCount ? '#ffe66d' : '#8dc63f';
    ctx.fillText(`${winners.length} / ${targetCount}명`, startX, 62);

    ctx.beginPath();
    ctx.rect(width - panelWidth - 8, 78, panelWidth, height - 86);
    ctx.clip();

    ctx.translate(0, -startY);
    ctx.font = 'bold 13pt sans-serif';
    if (theme.rankStroke) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.80)';
    }

    if (winners.length === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
      ctx.fillText('아직 선정자가 없습니다', startX, 100);
    }

    winners.forEach((marble: { hue: number; name: string }, rank: number) => {
      const y = rank * this.fontHeight;
      if (y >= startY && y <= startY + ctx.canvas.height) {
        const label = `${rank + 1}번째 선정 · ${marble.name}`;
        ctx.fillStyle = `hsl(${marble.hue} 100% ${theme.marbleLightness})`;
        if (theme.rankStroke) {
          ctx.strokeText(label, startX, 100 + y);
        }
        ctx.fillText(label, startX, 100 + y);
      }
    });
    ctx.restore();
  }

  update(deltaTime: number) {
    if (this._currentWinner === -1) {
      return;
    }
    if (this._userMoved > 0) {
      this._userMoved -= deltaTime;
    } else {
      this._targetY = Math.max(0, this._currentWinner * this.fontHeight - this.fontHeight * 5);
    }
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
