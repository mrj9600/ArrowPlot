import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { db } from '../core/db';
import { dim } from '../core/dimension';
import { storePhoto } from '../core/image';
import { Arrow, ARROW_FIELDS, LengthUnit } from '../core/models';
import { Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { ImageThumb } from '../ui/image-thumb';

@Component({
  selector: 'app-arrow-form',
  imports: [AppBar, Icon, ImageThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar [title]="isNew() ? 'New arrows' : arrow().name || 'Arrows'" back="/equipment">
      @if (!isNew()) {
        <button class="icon-btn" type="button" (click)="remove()" aria-label="Delete arrows">
          <app-icon name="delete" />
        </button>
      }
    </app-bar>
    <div class="page">
      <div class="card" style="display:grid;gap:12px">
        <div class="row" style="align-items:flex-start">
          <label class="photo">
            <app-image-thumb [imageId]="arrow().imageId" style="width:96px;height:96px"
              ><span class="small muted">Add photo</span></app-image-thumb
            >
            <input type="file" accept="image/*" hidden (change)="photo($event)" />
          </label>
          <div style="flex:1;display:grid;gap:10px">
            <label class="field"
              ><span>Name</span>
              <input
                class="input"
                [value]="arrow().name"
                (input)="set({ name: $any($event.target).value })"
                placeholder="X10 / ACE …"
              />
            </label>
            <div class="grid2">
              <label class="field"
                ><span>Diameter</span>
                <div class="row">
                  <input
                    class="input"
                    type="number"
                    inputmode="decimal"
                    step="0.1"
                    min="1"
                    [value]="arrow().diameter.value"
                    (input)="setDiameter(+$any($event.target).value, arrow().diameter.unit ?? 'mm')"
                  />
                  <select
                    class="input"
                    style="width:72px;flex:none"
                    (change)="setDiameter(arrow().diameter.value, $any($event.target).value)"
                  >
                    <option value="mm" [selected]="arrow().diameter.unit === 'mm'">mm</option>
                    <option value="in" [selected]="arrow().diameter.unit === 'in'">in</option>
                  </select>
                </div>
              </label>
              <label class="field"
                ><span>Number of arrows</span>
                <input
                  class="input"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="99"
                  [value]="arrow().maxArrowNumber"
                  (input)="set({ maxArrowNumber: Math.max(1, +$any($event.target).value || 1) })"
                />
              </label>
            </div>
          </div>
        </div>
        <p class="small muted" style="margin:0">
          The diameter decides line cutters: an arrow touching a line scores the higher ring.
        </p>
        <div class="grid2 stack">
          @for (f of fields; track f.key) {
            <label class="field" [style.grid-column]="f.key === 'comment' ? '1 / -1' : null"
              ><span>{{ f.label }}</span>
              <input
                class="input"
                [value]="arrow().fields[f.key] ?? ''"
                (input)="setField(f.key, $any($event.target).value)"
              />
            </label>
          }
        </div>
      </div>
      <button class="btn primary block" type="button" (click)="save()">Save</button>
    </div>
  `,
  styles: `
    .photo {
      cursor: pointer;
    }
  `,
})
export class ArrowFormPage {
  readonly id = input.required<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly Math = Math;
  protected readonly fields = ARROW_FIELDS;
  protected readonly arrow = signal<Arrow>({
    name: '',
    diameter: dim(5, 'mm'),
    maxArrowNumber: 12,
    fields: {},
  });
  protected readonly isNew = computed(() => this.id() === 'new');

  constructor() {
    effect(async () => {
      if (this.isNew()) return;
      const a = await db.arrows.get(+this.id());
      if (a) this.arrow.set(a);
    });
  }

  protected set(p: Partial<Arrow>) {
    this.arrow.update((a) => ({ ...a, ...p }));
  }
  protected setDiameter(v: number, unit: LengthUnit) {
    if (isFinite(v) && v > 0) this.set({ diameter: dim(v, unit) });
  }
  protected setField(k: string, v: string) {
    this.arrow.update((a) => ({ ...a, fields: { ...a.fields, [k]: v } }));
  }
  protected async photo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const old = this.arrow().imageId;
    const id = await storePhoto(f);
    if (old) await db.images.delete(old);
    this.set({ imageId: id });
  }
  protected async save() {
    const a = this.arrow();
    const fields = Object.fromEntries(Object.entries(a.fields).filter(([, v]) => v?.trim()));
    await this.repo.saveArrow({ ...a, name: a.name.trim() || 'Arrows', fields });
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }
  protected async remove() {
    if (!confirm(`Delete ${this.arrow().name}?`)) return;
    await this.repo.deleteArrow(+this.id());
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }
}
