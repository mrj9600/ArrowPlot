import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDimension } from '../core/dimension';
import { Arrow, Bow, StandardRound } from '../core/models';
import { describeRound } from '../core/standard-rounds';
import { live, Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { ImageThumb } from '../ui/image-thumb';

export const BOW_TYPE_LABEL: Record<string, string> = {
  recurve: 'Recurve',
  compound: 'Compound',
  longbow: 'Longbow',
  barebow: 'Barebow',
  horsebow: 'Horsebow',
  yumi: 'Yumi',
};

@Component({
  selector: 'app-equipment',
  imports: [AppBar, RouterLink, Icon, ImageThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Equipment" />
    <div class="page">
      <div class="row">
        <div class="section-title">Bows</div>
        <div class="spacer"></div>
        <a class="btn sm" routerLink="/bow/new"><app-icon name="add" /> Bow</a>
      </div>
      <div class="card flush">
        <ul class="list">
          @for (b of bows(); track b.id) {
            <li>
              <a class="item" [routerLink]="['/bow', b.id]">
                <app-image-thumb class="thumb" [imageId]="b.imageId"
                  ><app-icon name="bow"
                /></app-image-thumb>
                <div class="main">
                  <div class="title">{{ b.name }}</div>
                  <div class="sub">
                    {{ typeLabel[b.type]
                    }}{{ b.fields['drawWeight'] ? ' · ' + b.fields['drawWeight'] : ''
                    }}{{ b.sightMarks.length ? ' · ' + b.sightMarks.length + ' sight marks' : '' }}
                  </div>
                </div>
                <app-icon name="chevron" class="muted" />
              </a>
            </li>
          } @empty {
            <li class="item muted">No bows yet.</li>
          }
        </ul>
      </div>
      <div class="row">
        <div class="section-title">Arrows</div>
        <div class="spacer"></div>
        <a class="btn sm" routerLink="/arrow/new"><app-icon name="add" /> Arrows</a>
      </div>
      <div class="card flush">
        <ul class="list">
          @for (a of arrows(); track a.id) {
            <li>
              <a class="item" [routerLink]="['/arrow', a.id]">
                <app-image-thumb class="thumb" [imageId]="a.imageId"
                  ><app-icon name="target"
                /></app-image-thumb>
                <div class="main">
                  <div class="title">{{ a.name }}</div>
                  <div class="sub">
                    {{ fmt(a.diameter)
                    }}{{ a.fields['spine'] ? ' · spine ' + a.fields['spine'] : '' }} ·
                    {{ a.maxArrowNumber }} arrows
                  </div>
                </div>
                <app-icon name="chevron" class="muted" />
              </a>
            </li>
          } @empty {
            <li class="item muted">No arrows yet.</li>
          }
        </ul>
      </div>
      <div class="row">
        <div class="section-title">Rounds</div>
        <div class="spacer"></div>
        <a class="btn sm" routerLink="/standard-round/new"><app-icon name="add" /> Round</a>
      </div>
      <div class="card flush">
        <ul class="list">
          @for (s of rounds(); track s.id) {
            <li>
              <a class="item" [routerLink]="['/standard-round', s.id]">
                <app-icon name="target" class="muted" />
                <div class="main">
                  <div class="title">{{ s.name }}</div>
                  <div class="sub">{{ summary(s) }}</div>
                </div>
                <app-icon name="chevron" class="muted" />
              </a>
            </li>
          } @empty {
            <li class="item muted">No rounds yet. Add the rounds you shoot.</li>
          }
        </ul>
      </div>
    </div>
  `,
  styles: `
    .thumb {
      width: 44px;
      height: 44px;
      flex: none;
      color: var(--muted);
    }
  `,
})
export class EquipmentPage {
  private readonly repo = inject(Repo);
  protected readonly typeLabel = BOW_TYPE_LABEL;
  protected readonly fmt = formatDimension;
  protected readonly bows = live(() => this.repo.bows(), [] as Bow[]);
  protected readonly arrows = live(() => this.repo.arrows(), [] as Arrow[]);
  protected readonly rounds = live(() => this.repo.standardRounds(), [] as StandardRound[]);
  protected readonly summary = (s: StandardRound) => describeRound(s.round);
}
