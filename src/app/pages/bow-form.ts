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
import { dim, formatDimension } from '../core/dimension';
import { storePhoto } from '../core/image';
import { Bow, BOW_FIELDS, BOW_TYPES, BowType, LengthUnit, SightMark } from '../core/models';
import { Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { ImageThumb } from '../ui/image-thumb';
import { BOW_TYPE_LABEL } from './equipment';

@Component({
  selector: 'app-bow-form',
  imports: [AppBar, Icon, ImageThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar [title]="isNew() ? 'New bow' : bow().name || 'Bow'" back="/equipment">
      @if (!isNew()) {
        <button class="icon-btn" type="button" (click)="remove()" aria-label="Delete bow">
          <app-icon name="delete" />
        </button>
      }
    </app-bar>
    <div class="page">
      <div class="card" style="display:grid;gap:12px">
        <div class="row" style="align-items:flex-start">
          <label class="photo">
            <app-image-thumb [imageId]="bow().imageId" style="width:96px;height:96px"
              ><span class="small muted">Add photo</span></app-image-thumb
            >
            <input type="file" accept="image/*" hidden (change)="photo($event)" />
          </label>
          <div style="flex:1;display:grid;gap:10px">
            <label class="field"
              ><span>Name</span>
              <input
                class="input"
                [value]="bow().name"
                (input)="set({ name: $any($event.target).value })"
                placeholder="My recurve"
              />
            </label>
            <label class="field"
              ><span>Type</span>
              <select class="input" (change)="set({ type: $any($event.target).value })">
                @for (t of types; track t) {
                  <option [value]="t" [selected]="t === bow().type">{{ typeLabel[t] }}</option>
                }
              </select>
            </label>
          </div>
        </div>
        <div class="grid2 stack">
          @for (f of fields(); track f.key) {
            <label class="field" [style.grid-column]="f.key === 'description' ? '1 / -1' : null"
              ><span>{{ f.label }}</span>
              @if (f.key === 'description') {
                <textarea
                  class="input"
                  [value]="bow().fields[f.key] ?? ''"
                  (input)="setField(f.key, $any($event.target).value)"
                ></textarea>
              } @else {
                <input
                  class="input"
                  [value]="bow().fields[f.key] ?? ''"
                  (input)="setField(f.key, $any($event.target).value)"
                />
              }
            </label>
          }
        </div>
      </div>
      <div class="card" style="display:grid;gap:8px">
        <h3>Sight marks</h3>
        @for (m of sortedMarks(); track $index) {
          <div class="row">
            <span class="num" style="width:70px">{{ fmt(m.distance) }}</span>
            <b class="num" style="flex:1">{{ m.value }}</b>
            <button
              class="icon-btn"
              type="button"
              (click)="removeMark(m)"
              aria-label="Remove sight mark"
            >
              <app-icon name="close" />
            </button>
          </div>
        }
        <div class="row">
          <input
            class="input"
            type="number"
            inputmode="decimal"
            placeholder="Distance"
            #d
            style="width:100px"
          />
          <select class="input" #u style="width:70px">
            <option value="m">m</option>
            <option value="yd">yd</option>
          </select>
          <input class="input" placeholder="Mark" #v />
          <button
            class="btn"
            type="button"
            (click)="addMark(+d.value, $any(u.value), v.value); d.value = ''; v.value = ''"
          >
            Add
          </button>
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
export class BowFormPage {
  readonly id = input.required<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly types = BOW_TYPES;
  protected readonly typeLabel = BOW_TYPE_LABEL;
  protected readonly fmt = formatDimension;
  protected readonly bow = signal<Bow>({ name: '', type: 'recurve', fields: {}, sightMarks: [] });
  protected readonly isNew = computed(() => this.id() === 'new');
  protected readonly fields = computed(() =>
    BOW_FIELDS.filter((f) => !f.types || f.types.includes(this.bow().type)),
  );
  protected readonly sortedMarks = computed(() =>
    [...this.bow().sightMarks].sort(
      (a, b) =>
        (a.distance.unit ?? '').localeCompare(b.distance.unit ?? '') ||
        a.distance.value - b.distance.value,
    ),
  );

  constructor() {
    effect(async () => {
      if (this.isNew()) return;
      const b = await db.bows.get(+this.id());
      if (b) this.bow.set(b);
    });
  }

  protected set(p: Partial<Bow>) {
    this.bow.update((b) => ({ ...b, ...p, type: (p.type as BowType) ?? b.type }));
  }
  protected setField(k: string, v: string) {
    this.bow.update((b) => ({ ...b, fields: { ...b.fields, [k]: v } }));
  }
  protected addMark(d: number, unit: LengthUnit, value: string) {
    if (!isFinite(d) || d <= 0 || !value.trim()) return;
    this.bow.update((b) => ({
      ...b,
      sightMarks: [...b.sightMarks, { distance: dim(d, unit), value: value.trim() }],
    }));
  }
  protected removeMark(m: SightMark) {
    this.bow.update((b) => ({ ...b, sightMarks: b.sightMarks.filter((x) => x !== m) }));
  }
  protected async photo(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (!f) return;
    const old = this.bow().imageId;
    const id = await storePhoto(f);
    if (old) await db.images.delete(old);
    this.set({ imageId: id });
  }
  protected async save() {
    const b = this.bow();
    const fields = Object.fromEntries(Object.entries(b.fields).filter(([, v]) => v?.trim()));
    await this.repo.saveBow({ ...b, name: b.name.trim() || BOW_TYPE_LABEL[b.type], fields });
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }
  protected async remove() {
    if (
      !confirm(
        `Delete ${this.bow().name}? Trainings keep their scores but lose the link to this bow.`,
      )
    )
      return;
    await this.repo.deleteBow(+this.id());
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }
}
