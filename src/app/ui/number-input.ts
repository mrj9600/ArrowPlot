import { Directive, effect, ElementRef, inject, input, output } from '@angular/core';

/**
 * A number field that may be empty while it is edited: clearing it to type a new value doesn't
 * put a default in it (2 → backspace → 1 → typing 1 gave 11). An empty field changes nothing,
 * and leaving it shows the current value again.
 *
 *   <input type="number" [appNumber]="value" (appNumberChange)="set($event)" />
 */
@Directive({
  selector: 'input[appNumber]',
  host: { '(input)': 'typed()', '(blur)': 'show()' },
})
export class NumberInput {
  readonly appNumber = input.required<number>();
  readonly appNumberChange = output<number>();
  private readonly el: HTMLInputElement = inject(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      const v = this.appNumber();
      // Keep what is being typed when it already means this value (e.g. "1." or "05").
      if (this.el.value === '' && document.activeElement === this.el) return;
      if (Number(this.el.value) !== v || this.el.value === '') this.el.value = String(v);
    });
  }

  protected typed() {
    const raw = this.el.value.trim();
    if (raw === '') return;
    const v = Number(raw);
    if (isFinite(v)) this.appNumberChange.emit(v);
  }

  protected show() {
    this.el.value = String(this.appNumber());
  }
}
