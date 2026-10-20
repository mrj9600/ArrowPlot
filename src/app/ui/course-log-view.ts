import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { analyseCourseLog, JudgingRow, LogEntry } from '../core/course-log';

/** Distance judging and course conditions from the course logs of 3D and field targets. */
@Component({
  selector: 'app-course-log-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (a(); as a) {
      <div class="stats-grid">
        <div class="stat">
          <div class="k">Judged targets</div>
          <div class="v">{{ a.all.n }}</div>
          <div class="h">with judged and measured distance</div>
        </div>
        @if (a.all.n) {
          <div class="stat">
            <div class="k">Average miss</div>
            <div class="v">{{ a.all.off.toFixed(1) }} m</div>
            <div class="h">either way</div>
          </div>
          <div class="stat">
            <div class="k">Tendency</div>
            <div class="v sm">{{ tendency(a.all) }}</div>
          </div>
        }
      </div>
      @for (t of tables(); track t.title) {
        @if (t.rows.length) {
          <div class="scroll-x">
            <table class="tbl">
              <thead>
                <tr>
                  <th>{{ t.title }}</th>
                  <th>Targets</th>
                  <th>Tendency</th>
                  <th>Avg miss</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                @for (r of t.rows; track r.label) {
                  <tr>
                    <td>{{ r.label }}</td>
                    <td>{{ r.targets }}</td>
                    <td [class.warn]="r.n && abs(r.biasPct) > 10">
                      {{ r.n ? signed(r.biasPct) + '%' : '–' }}
                    </td>
                    <td>{{ r.n ? r.off.toFixed(1) + ' m' : '–' }}</td>
                    <td>{{ r.score.toFixed(1) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      }
      <p class="small muted" style="margin:0">
        Tendency: + means judged too far, − too short. Score is the average per target.
      </p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    .v.sm {
      font-size: 16px;
    }
    td:not(:first-child) {
      white-space: nowrap;
    }
    .warn {
      color: var(--bad, #c62828);
      font-weight: 650;
    }
  `,
})
export class CourseLogView {
  readonly entries = input.required<LogEntry[]>();
  protected readonly abs = Math.abs;

  protected readonly a = computed(() =>
    this.entries().length ? analyseCourseLog(this.entries()) : null,
  );
  protected readonly tables = computed(() => {
    const a = this.a();
    if (!a) return [];
    return [
      { title: 'Distance', rows: a.byDistance },
      { title: 'Angle', rows: a.byAngle },
      { title: 'Condition', rows: a.byCondition },
    ];
  });

  protected signed(v: number) {
    const r = Math.round(v);
    return r > 0 ? `+${r}` : `${r}`;
  }
  protected tendency(r: JudgingRow) {
    if (Math.abs(r.biasPct) < 2) return 'About right';
    return `${r.bias > 0 ? 'Too far' : 'Too short'} by ${Math.abs(r.bias).toFixed(1)} m (${this.signed(r.biasPct)}%)`;
  }
}
