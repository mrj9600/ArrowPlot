import { ChangeDetectionStrategy, Component, computed, model } from '@angular/core';
import { dim, formatDimension, sameDimension } from '../core/dimension';
import { LengthUnit, RoundTemplate } from '../core/models';
import { getTarget, TARGET_PICKER_ORDER } from '../core/targets';
import { TargetFace } from './target-face';

/** Distance, face, scoring and end layout of one round. */
@Component({
  selector: 'app-round-settings',
  imports: [TargetFace],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="preview">
        <app-target-face [targetId]="value().targetId" [scoringStyle]="value().scoringStyle" />
      </div>
      <div class="fields">
        <label class="field">
          <span>Target face</span>
          <select
            class="input"
            [value]="value().targetId"
            (change)="setTarget(+$any($event.target).value)"
          >
            @for (t of targets; track t.id) {
              <option [value]="t.id" [selected]="t.id === value().targetId">{{ t.name }}</option>
            }
          </select>
        </label>
        <div class="grid2">
          <label class="field">
            <span>Face size</span>
            <select class="input" (change)="setDiameter(+$any($event.target).value)">
              @for (d of model().diameters; track $index) {
                <option [value]="$index" [selected]="isDiameter(d)">{{ fmt(d) }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>Scoring</span>
            <select class="input" (change)="patch({ scoringStyle: +$any($event.target).value })">
              @for (s of model().styles; track $index) {
                <option [value]="$index" [selected]="$index === value().scoringStyle">
                  {{ s.name }}
                </option>
              }
            </select>
          </label>
        </div>
      </div>
    </div>
    <div class="grid2">
      <label class="field">
        <span>Distance</span>
        <div class="row">
          <input
            class="input"
            type="number"
            inputmode="decimal"
            min="1"
            step="any"
            [value]="value().distance.value"
            (input)="setDistance(+$any($event.target).value)"
          />
          <select class="input unit" (change)="setUnit($any($event.target).value)">
            @for (u of units; track u) {
              <option [value]="u" [selected]="u === value().distance.unit">{{ u }}</option>
            }
          </select>
        </div>
      </label>
      <div class="grid2">
        <label class="field">
          <span>Arrows / end</span>
          <input
            class="input"
            type="number"
            inputmode="numeric"
            min="1"
            max="12"
            [value]="value().shotsPerEnd"
            (input)="patch({ shotsPerEnd: clamp(+$any($event.target).value, 1, 12) })"
          />
        </label>
        <label class="field">
          <span>Ends</span>
          <input
            class="input"
            type="number"
            inputmode="numeric"
            min="0"
            max="99"
            [value]="value().endCount || ''"
            placeholder="Open"
            (input)="patch({ endCount: clamp(+$any($event.target).value, 0, 99) })"
          />
        </label>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    .wrap {
      display: grid;
      grid-template-columns: 96px 1fr;
      gap: 14px;
      align-items: center;
    }
    .preview {
      width: 96px;
    }
    .fields {
      display: grid;
      gap: 10px;
    }
    .unit {
      width: 76px;
      flex: none;
    }
  `,
})
export class RoundSettings {
  readonly value = model.required<RoundTemplate>();
  protected readonly targets = TARGET_PICKER_ORDER.map(getTarget);
  protected readonly units: LengthUnit[] = ['m', 'yd'];
  protected readonly model = computed(() => getTarget(this.value().targetId));
  protected readonly fmt = formatDimension;

  protected clamp(v: number, lo: number, hi: number) {
    return isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : lo;
  }
  protected patch(p: Partial<RoundTemplate>) {
    this.value.update((v) => ({ ...v, ...p }));
  }
  protected isDiameter(d: RoundTemplate['targetDiameter']) {
    return sameDimension(d, this.value().targetDiameter);
  }
  protected setTarget(id: number) {
    const t = getTarget(id);
    const v = this.value();
    const keep = t.diameters.find((d) => sameDimension(d, v.targetDiameter));
    this.patch({
      targetId: id,
      targetDiameter: keep ?? t.diameters[0],
      scoringStyle: v.scoringStyle < t.styles.length ? v.scoringStyle : 0,
    });
  }
  protected setDiameter(i: number) {
    this.patch({ targetDiameter: this.model().diameters[i] });
  }
  protected setDistance(v: number) {
    if (isFinite(v) && v > 0) this.patch({ distance: dim(v, this.value().distance.unit ?? 'm') });
  }
  protected setUnit(u: LengthUnit) {
    this.patch({ distance: dim(this.value().distance.value, u) });
  }
}
