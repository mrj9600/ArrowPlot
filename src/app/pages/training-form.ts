import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { db } from '../core/db';
import { dim, formatDimension } from '../core/dimension';
import {
  Arrow,
  Bow,
  RoundTemplate,
  StandardRound,
  Training,
  Weather,
  WEATHER,
} from '../core/models';
import { Repo, todayIso } from '../core/repo.service';
import { getTarget } from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { RoundSettings } from '../ui/round-settings';

const DEFAULT_ROUND: RoundTemplate = {
  distance: dim(18, 'm'),
  targetId: 0,
  scoringStyle: 0,
  targetDiameter: dim(40, 'cm'),
  shotsPerEnd: 3,
  endCount: 10,
};

const WEATHER_LABEL: Record<Weather, string> = {
  sunny: 'Sunny',
  partlyCloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  lightRain: 'Light rain',
  rain: 'Rain',
};

@Component({
  selector: 'app-training-form',
  imports: [AppBar, FormsModule, RoundSettings, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar
      [title]="id() ? 'Edit training' : 'New training'"
      [back]="id() ? '/training/' + id() : '/'"
    />
    <form class="page" (ngSubmit)="save()">
      <div class="card" style="display:grid;gap:12px">
        <label class="field"
          ><span>Title</span>
          <input class="input" name="title" [(ngModel)]="title" placeholder="Training" />
        </label>
        <div class="grid2">
          <label class="field"
            ><span>Date</span>
            <input class="input" type="date" name="date" [(ngModel)]="date" required />
          </label>
          <div class="field">
            <span>Where</span>
            <div class="seg">
              <button type="button" [class.on]="indoor()" (click)="indoor.set(true)">Indoor</button>
              <button type="button" [class.on]="!indoor()" (click)="indoor.set(false)">
                Outdoor
              </button>
            </div>
          </div>
        </div>
        <div class="grid2 stack">
          <label class="field"
            ><span>Bow</span>
            <select class="input" name="bow" [(ngModel)]="bowId">
              <option [ngValue]="null">No bow</option>
              @for (b of bows(); track b.id) {
                <option [ngValue]="b.id">{{ b.name }}</option>
              }
            </select>
          </label>
          <label class="field"
            ><span>Arrows</span>
            <select class="input" name="arrow" [(ngModel)]="arrowId">
              <option [ngValue]="null">No arrows</option>
              @for (a of arrows(); track a.id) {
                <option [ngValue]="a.id">{{ a.name }}</option>
              }
            </select>
          </label>
        </div>
        @if (!bows().length || !arrows().length) {
          <p class="small muted" style="margin:0">
            Add your bows and arrows under <a routerLink="/equipment">Equipment</a> to track them
            per training. The arrow diameter makes line-cutter scoring exact.
          </p>
        }
        @if (!indoor()) {
          <div class="grid2">
            <label class="field"
              ><span>Weather</span>
              <select class="input" name="weather" [(ngModel)]="weather">
                <option [ngValue]="null">–</option>
                @for (w of weathers; track w) {
                  <option [ngValue]="w">{{ weatherLabel[w] }}</option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Wind (Beaufort)</span>
              <input
                class="input"
                type="number"
                min="0"
                max="12"
                name="wind"
                [(ngModel)]="windSpeed"
              />
            </label>
          </div>
        }
        <label class="field"
          ><span>Location</span>
          <input class="input" name="location" [(ngModel)]="location" />
        </label>
        <label class="check"
          ><input type="checkbox" name="numbering" [(ngModel)]="arrowNumbering" /> Number my
          arrows</label
        >
        <label class="field"
          ><span>Notes</span>
          <textarea class="input" name="comment" [(ngModel)]="comment"></textarea>
        </label>
      </div>

      @if (!id()) {
        <div class="card" style="display:grid;gap:12px">
          <div class="seg" style="justify-self:start">
            <button type="button" [class.on]="mode() === 'practice'" (click)="mode.set('practice')">
              Practice
            </button>
            <button type="button" [class.on]="mode() === 'standard'" (click)="mode.set('standard')">
              Standard round
            </button>
          </div>
          @if (mode() === 'practice') {
            <app-round-settings [(value)]="practice" />
          } @else {
            <label class="field"
              ><span>Round</span>
              <select
                class="input"
                name="sr"
                [(ngModel)]="standardId"
                (ngModelChange)="standardSignal.set($event)"
              >
                @for (s of standardRounds(); track s.id) {
                  <option [ngValue]="s.id">{{ s.club }} · {{ s.name }}</option>
                }
              </select>
            </label>
            @if (selectedStandard(); as s) {
              <ul class="small muted" style="margin:0;padding-left:18px">
                @for (r of s.rounds; track $index) {
                  <li>{{ describe(r) }}</li>
                }
              </ul>
            }
          }
        </div>
      }
      <button class="btn primary block" type="submit" [disabled]="busy()">
        {{ id() ? 'Save' : 'Start training' }}
      </button>
    </form>
  `,
})
export class TrainingFormPage {
  readonly id = input<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  protected readonly weathers = WEATHER;
  protected readonly weatherLabel = WEATHER_LABEL;
  protected readonly bows = signal<Bow[]>([]);
  protected readonly arrows = signal<Arrow[]>([]);
  protected readonly standardRounds = signal<StandardRound[]>([]);
  protected readonly busy = signal(false);
  protected readonly mode = signal<'practice' | 'standard'>('practice');
  protected readonly indoor = signal(true);
  protected readonly practice = signal<RoundTemplate>(DEFAULT_ROUND);

  protected title = '';
  protected date = todayIso();
  protected bowId: number | null = null;
  protected arrowId: number | null = null;
  protected weather: Weather | null = null;
  protected windSpeed = 0;
  protected location = '';
  protected comment = '';
  protected arrowNumbering = false;
  protected standardId: number | null = null;
  private existing: Training | null = null;
  protected readonly standardSignal = signal<number | null>(null);

  protected readonly selectedStandard = computed(
    () => this.standardRounds().find((s) => s.id === this.standardSignal()) ?? null,
  );

  constructor() {
    effect(() => {
      const id = this.id();
      this.load(id ? +id : null);
    });
  }

  private async load(id: number | null) {
    const [bows, arrows, srs] = await Promise.all([
      this.repo.bows(),
      this.repo.arrows(),
      this.repo.standardRounds(),
    ]);
    this.bows.set(bows);
    this.arrows.set(arrows);
    this.standardRounds.set(srs);
    if (id) {
      const t = await db.trainings.get(id);
      if (!t) return;
      this.existing = t;
      Object.assign(this, {
        title: t.title,
        date: t.date,
        bowId: t.bowId ?? null,
        arrowId: t.arrowId ?? null,
        weather: t.weather ?? null,
        windSpeed: t.windSpeed ?? 0,
        location: t.location,
        comment: t.comment,
        arrowNumbering: t.arrowNumbering,
      });
      this.indoor.set(t.indoor);
    } else {
      const last = await this.repo.getSetting<
        Partial<{
          round: RoundTemplate;
          bowId: number;
          arrowId: number;
          indoor: boolean;
          standardId: number;
          mode: 'practice' | 'standard';
        }>
      >('lastTraining', {});
      if (last.round) this.practice.set(last.round);
      if (last.bowId && bows.some((b) => b.id === last.bowId)) this.bowId = last.bowId;
      else if (bows.length === 1) this.bowId = bows[0].id!;
      if (last.arrowId && arrows.some((a) => a.id === last.arrowId)) this.arrowId = last.arrowId;
      else if (arrows.length === 1) this.arrowId = arrows[0].id!;
      if (last.indoor !== undefined) this.indoor.set(last.indoor);
      if (last.mode) this.mode.set(last.mode);
      this.standardId = srs.find((s) => s.id === last.standardId)?.id ?? srs[0]?.id ?? null;
    }
    this.standardSignal.set(this.standardId);
    this.cdr.markForCheck();
  }

  protected describe(r: RoundTemplate) {
    const t = getTarget(r.targetId);
    return `${formatDimension(r.distance)} · ${t.name} ${formatDimension(r.targetDiameter)} · ${r.endCount} × ${r.shotsPerEnd} arrows`;
  }

  protected async save() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const base = {
        title: this.title.trim() || 'Training',
        date: this.date || todayIso(),
        bowId: this.bowId,
        arrowId: this.arrowId,
        indoor: this.indoor(),
        weather: this.indoor() ? null : this.weather,
        windSpeed: this.indoor() ? 0 : +this.windSpeed || 0,
        windDirection: this.existing?.windDirection ?? 0,
        location: this.location.trim(),
        comment: this.comment.trim(),
        arrowNumbering: this.arrowNumbering,
      };
      if (this.existing) {
        await this.repo.updateTraining({ ...this.existing, ...base });
        this.router.navigate(['/training', this.existing.id], { replaceUrl: true });
        return;
      }
      const sr = this.mode() === 'standard' ? this.selectedStandard() : null;
      const rounds = sr ? sr.rounds : [this.practice()];
      if (!rounds.length) return;
      const id = await this.repo.createTraining(
        {
          ...base,
          title: this.title.trim() || (sr ? sr.name : 'Training'),
          standardRoundId: sr?.id ?? null,
          source: 'manual',
        },
        rounds,
      );
      await this.repo.setSetting('lastTraining', {
        round: this.practice(),
        bowId: this.bowId,
        arrowId: this.arrowId,
        indoor: this.indoor(),
        standardId: this.standardId,
        mode: this.mode(),
      });
      const [first] = await this.repo.roundsOf(id);
      await this.router.navigate(['/training', id], { replaceUrl: true });
      this.router.navigate(['/round', first.id, 'end', 0]);
    } finally {
      this.busy.set(false);
    }
  }
}
