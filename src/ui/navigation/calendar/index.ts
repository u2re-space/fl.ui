// @ts-ignore
import styles from "veela-lib/ui/components/calendar/index.scss?inline";

export type CalendarView = "month" | "week" | "day";

export interface ScheduleInput {
    id?: string;
    title: string;
    start: Date | string;
    end: Date | string;
    color?: string;
    allDay?: boolean;
}

export interface Schedule {
    id: string;
    title: string;
    start: Date;
    end: Date;
    color: string;
    allDay: boolean;
}

const DAY_MS = 86_400_000;
const HOUR_HEIGHT = 56;

function pad(value: number): string {
    return String(value).padStart(2, "0");
}

function localDate(
    year: number,
    month: number,
    day: number,
    hour = 0,
    minute = 0,
): Date {
    return new Date(year, month, day, hour, minute, 0, 0);
}

function parseDate(value: Date | string): Date {
    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    // YYYY-MM-DD интерпретируем как локальную дату,
    // а не как UTC-д дату.
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return localDate(year, month - 1, day);
    }

    return new Date(value);
}

function dateKey(date: Date): string {
    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join("-");
}

function fromDateKey(value: string): Date {
    const [year, month, day] = value.split("-").map(Number);
    return localDate(year, month - 1, day);
}

function startOfDay(date: Date): Date {
    return localDate(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
    );
}

function endOfDay(date: Date): Date {
    const result = startOfDay(date);
    result.setDate(result.getDate() + 1);
    return result;
}

function addDays(date: Date, amount: number): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + amount);
    return result;
}

function startOfWeek(date: Date, weekStartsOn = 1): Date {
    const result = startOfDay(date);
    const currentDay = result.getDay();
    const normalizedDay = currentDay === 0 ? 7 : currentDay;
    const diff = normalizedDay - weekStartsOn;

    result.setDate(result.getDate() - diff);
    return result;
}

function sameDay(a: Date, b: Date): boolean {
    return dateKey(a) === dateKey(b);
}

function formatDay(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(date);
}

function formatMonth(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        month: "long",
        year: "numeric",
    }).format(date);
}

function formatWeek(date: Date, locale: string): string {
    const start = startOfWeek(date);
    const end = addDays(start, 6);

    const startText = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
    }).format(start);

    const endText = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(end);

    return `${startText} — ${endText}`;
}

function formatTime(date: Date, locale: string): string {
    return new Intl.DateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
    }).format(date);
}

function escapeHtml(value: unknown): string {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function safeColor(value?: string): string {
    if (!value) {
        return "#2563eb";
    }

    const isSafe =
        /^#[0-9a-f]{3,8}$/i.test(value) ||
        /^(rgb|rgba|hsl|hsla)\([^)]{1,100}\)$/i.test(value) ||
        /^[a-z]{1,30}$/i.test(value);

    return isSafe ? value : "#2563eb";
}

function createId(): string {
    if ("randomUUID" in crypto) {
        return crypto.randomUUID();
    }

    return `schedule-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeSchedule(input: ScheduleInput): Schedule {
    let start = parseDate(input.start);
    let end = parseDate(input.end);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        throw new Error("Invalid schedule date");
    }

    if (end <= start) {
        end = new Date(start.getTime() + 30 * 60_000);
    }

    return {
        id: input.id ?? createId(),
        title: input.title,
        start,
        end,
        color: safeColor(input.color),
        allDay: Boolean(input.allDay),
    };
}

export class CalendarScheduler extends (typeof HTMLElement != "undefined" ? HTMLElement : (Object as any)) {
    static observedAttributes = ["view", "date", "locale", "slot-minutes"];

    private readonly root: ShadowRoot;
    private readonly locale: string;

    private _view: CalendarView = "month";
    private _activeDate: Date = startOfDay(new Date());
    private _slotMinutes = 30;
    private _events: Schedule[] = [];

    private dragState:
        | {
            day: string;
            startMinute: number;
            currentMinute: number;
        }
        | undefined;

    private ignoreNextSlotClick = false;

    private readonly onRootClick = (event: Event): void => {
        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const actionElement = target.closest<HTMLElement>("[data-action]");
        const action = actionElement?.dataset.action;

        if (action === "prev") {
            this.navigate(-1);
            return;
        }

        if (action === "next") {
            this.navigate(1);
            return;
        }

        if (action === "today") {
            this._activeDate = startOfDay(new Date());
            this.render();
            this.emit("date-change", {
                date: new Date(this._activeDate),
            });
            return;
        }

        if (action === "view") {
            const view = actionElement?.dataset.view as CalendarView | undefined;

            if (view) {
                this.setView(view);
            }

            return;
        }

        if (action === "day") {
            const value = actionElement?.dataset.date;

            if (value) {
                this._activeDate = fromDateKey(value);
                this.setView("day", false);
            }

            return;
        }

        if (action === "event") {
            const eventId = actionElement?.dataset.eventId;

            if (eventId) {
                this.editSchedule(eventId);
            }

            return;
        }

        if (action === "slot") {
            const slot = target.closest<HTMLElement>(".slot-hit");

            if (slot) {
                if (this.ignoreNextSlotClick) {
                    this.ignoreNextSlotClick = false;
                    return;
                }

                this.createSchedule(
                    slot.dataset.date!,
                    Number(slot.dataset.minute),
                    Number(slot.dataset.minute) + this._slotMinutes,
                );
            }

            return;
        }

        // Пустой участок строки недели в режиме месяца.
        if (
            this._view === "month" &&
            target.closest(".month-week") &&
            !target.closest(".month-day") &&
            !target.closest(".month-event")
        ) {
            const week = target.closest<HTMLElement>(".month-week");
            const weekStart = week?.dataset.weekStart;

            if (weekStart) {
                this._activeDate = fromDateKey(weekStart);
                this.setView("week");
            }
        }
    };

    private readonly onRootChange = (event: Event): void => {
        const target = event.target;

        if (!(target instanceof HTMLSelectElement)) {
            return;
        }

        if (target.dataset.action === "slot") {
            const value = Number(target.value);

            if ([15, 30, 60].includes(value)) {
                this._slotMinutes = value;
                this.render();
            }
        }
    };

    private readonly onPointerDown = (event: PointerEvent): void => {
        if (event.button !== 0) {
            return;
        }

        const target = event.target;

        if (!(target instanceof Element)) {
            return;
        }

        const slot = target.closest<HTMLElement>(".slot-hit");

        if (!slot) {
            return;
        }

        event.preventDefault();

        this.dragState = {
            day: slot.dataset.date!,
            startMinute: Number(slot.dataset.minute),
            currentMinute: Number(slot.dataset.minute),
        };

        window.addEventListener("pointermove", this.onPointerMove);
        window.addEventListener("pointerup", this.onPointerUp, { once: true });
    };

    private readonly onPointerMove = (event: PointerEvent): void => {
        if (!this.dragState) {
            return;
        }

        const element = document.elementFromPoint(
            event.clientX,
            event.clientY,
        );

        if (!(element instanceof Element)) {
            return;
        }

        const slot = element.closest<HTMLElement>(".slot-hit");

        if (!slot || slot.dataset.date !== this.dragState.day) {
            return;
        }

        this.dragState.currentMinute = Number(slot.dataset.minute);
    };

    private readonly onPointerUp = (): void => {
        if (!this.dragState) {
            return;
        }

        const { day, startMinute, currentMinute } = this.dragState;

        const start = Math.min(startMinute, currentMinute);
        const end =
            Math.max(startMinute, currentMinute) + this._slotMinutes;

        this.dragState = undefined;
        this.ignoreNextSlotClick = true;

        window.removeEventListener("pointermove", this.onPointerMove);

        this.createSchedule(day, start, end);

        window.setTimeout(() => {
            this.ignoreNextSlotClick = false;
        }, 150);
    };

    constructor() {
        super();

        this.root = this.attachShadow({ mode: "open" });

        this.locale =
            this.getAttribute("locale") ||
            document.documentElement.lang ||
            "ru-RU";
    }

    connectedCallback(): void {
        const view = this.getAttribute("view");

        if (view === "month" || view === "week" || view === "day") {
            this._view = view;
        }

        const date = this.getAttribute("date");

        if (date) {
            const parsedDate = parseDate(date);

            if (!Number.isNaN(parsedDate.getTime())) {
                this._activeDate = startOfDay(parsedDate);
            }
        }

        const slotMinutes = Number(this.getAttribute("slot-minutes"));

        if ([15, 30, 60].includes(slotMinutes)) {
            this._slotMinutes = slotMinutes;
        }

        this.root.innerHTML = `<style>${styles}</style><div class="calendar"></div>`;

        this.root.addEventListener("click", this.onRootClick);
        this.root.addEventListener("change", this.onRootChange);

        this.render();
    }

    disconnectedCallback(): void {
        this.root.removeEventListener("click", this.onRootClick);
        this.root.removeEventListener("change", this.onRootChange);

        window.removeEventListener("pointermove", this.onPointerMove);
        window.removeEventListener("pointerup", this.onPointerUp);
    }

    attributeChangedCallback(
        name: string,
        _oldValue: string | null,
        newValue: string | null,
    ): void {
        if (!this.isConnected) {
            return;
        }

        if (name === "view") {
            if (
                newValue === "month" ||
                newValue === "week" ||
                newValue === "day"
            ) {
                this._view = newValue;
                this.render();
            }
        }

        if (name === "date" && newValue) {
            const value = parseDate(newValue);

            if (!Number.isNaN(value.getTime())) {
                this._activeDate = startOfDay(value);
                this.render();
            }
        }

        if (name === "slot-minutes" && newValue) {
            const value = Number(newValue);

            if ([15, 30, 60].includes(value)) {
                this._slotMinutes = value;
                this.render();
            }
        }
    }

    get view(): CalendarView {
        return this._view;
    }

    set view(value: CalendarView) {
        this.setView(value);
    }

    get date(): Date {
        return new Date(this._activeDate.getTime());
    }

    set date(value: Date | string) {
        const parsed = parseDate(value);

        if (!Number.isNaN(parsed.getTime())) {
            this._activeDate = startOfDay(parsed);
            this.render();
        }
    }

    get events(): Schedule[] {
        return this._events.map((event) => ({
            ...event,
            start: new Date(event.start),
            end: new Date(event.end),
        }));
    }

    set events(value: ScheduleInput[]) {
        this._events = value.map(normalizeSchedule);
        this.render();
    }

    private setView(view: CalendarView, emitEvent = true): void {
        this._view = view;
        this.render();

        if (emitEvent) {
            this.emit("view-change", {
                view,
                date: new Date(this._activeDate),
            });
        }
    }

    private navigate(direction: number): void {
        if (this._view === "month") {
            this._activeDate = new Date(
                this._activeDate.getFullYear(),
                this._activeDate.getMonth() + direction,
                1,
            );
        }

        if (this._view === "week") {
            this._activeDate = addDays(this._activeDate, direction * 7);
        }

        if (this._view === "day") {
            this._activeDate = addDays(this._activeDate, direction);
        }

        this.render();

        this.emit("date-change", {
            date: new Date(this._activeDate),
        });
    }

    private emit(name: string, detail: unknown): void {
        this.dispatchEvent(
            new CustomEvent(name, {
                detail,
                bubbles: true,
                composed: true,
            }),
        );
    }

    private get calendarElement(): HTMLElement {
        return this.root.querySelector(".calendar") as HTMLElement;
    }

    private render(): void {
        if (!this.isConnected) {
            return;
        }

        const title =
            this._view === "month"
                ? formatMonth(this._activeDate, this.locale)
                : this._view === "week"
                    ? formatWeek(this._activeDate, this.locale)
                    : formatDay(this._activeDate, this.locale);

        this.calendarElement.innerHTML = `
      <header class="calendar-toolbar">
        <div class="toolbar-main">
          <button class="icon-button" data-action="prev" aria-label="Назад">
            ‹
          </button>

          <button class="today-button" data-action="today">
            Сегодня
          </button>

          <button class="icon-button" data-action="next" aria-label="Вперед">
            ›
          </button>

          <h1 class="calendar-title">${escapeHtml(title)}</h1>
        </div>

        <div class="toolbar-actions">
          <div class="view-switcher" role="tablist" aria-label="Режим календаря">
            ${this.renderViewButton("month", "Месяц")}
            ${this.renderViewButton("week", "Неделя")}
            ${this.renderViewButton("day", "День")}
          </div>

          ${this._view !== "month"
                ? `
                <label class="slot-control">
                  <span>Шаг</span>
                  <select data-action="slot">
                    ${[15, 30, 60]
                    .map(
                        (value) => `
                          <option
                            value="${value}"
                            ${value === this._slotMinutes ? "selected" : ""}
                          >
                            ${value} мин
                          </option>
                        `,
                    )
                    .join("")}
                  </select>
                </label>
              `
                : ""
            }
        </div>
      </header>

      <main class="calendar-content">
        ${this._view === "month"
                ? this.renderMonth()
                : this.renderTimeline()
            }
      </main>

      <footer class="calendar-hint">
        ${this._view === "month"
                ? "Нажмите на строку недели или на отдельный день"
                : "Нажмите или протяните мышью по времени для создания расписания"
            }
      </footer>
    `;

        if (this._view !== "month") {
            this.bindTimeline();
        }
    }

    private renderViewButton(
        view: CalendarView,
        label: string,
    ): string {
        return `
      <button
        class="view-button ${this._view === view ? "is-active" : ""}"
        data-action="view"
        data-view="${view}"
        role="tab"
        aria-selected="${this._view === view}"
      >
        ${label}
      </button>
    `;
    }

    private renderMonth(): string {
        const firstDay = localDate(
            this._activeDate.getFullYear(),
            this._activeDate.getMonth(),
            1,
        );

        const gridStart = startOfWeek(firstDay);
        const weekDays = Array.from({ length: 7 }, (_, index) =>
            addDays(gridStart, index),
        );

        const weekLabels = weekDays
            .map(
                (day) => `
          <div class="weekday-label">
            ${escapeHtml(
                    new Intl.DateTimeFormat(this.locale, {
                        weekday: "short",
                    }).format(day),
                )}
          </div>
        `,
            )
            .join("");

        const weeks = Array.from({ length: 6 }, (_, weekIndex) => {
            const weekStart = addDays(gridStart, weekIndex * 7);

            const days = Array.from({ length: 7 }, (_, dayIndex) =>
                addDays(weekStart, dayIndex),
            );

            return `
        <section
          class="month-week"
          data-week-start="${dateKey(weekStart)}"
          aria-label="Неделя ${escapeHtml(formatWeek(weekStart, this.locale))}"
        >
          ${days.map((day) => this.renderMonthDay(day)).join("")}
        </section>
      `;
        }).join("");

        return `
      <section class="month-view">
        <div class="month-weekdays">
          ${weekLabels}
        </div>

        <div class="month-grid">
          ${weeks}
        </div>
      </section>
    `;
    }

    private renderMonthDay(day: Date): string {
        const isCurrentMonth =
            day.getMonth() === this._activeDate.getMonth();

        const isToday = sameDay(day, new Date());
        const dayEvents = this.eventsForDay(day);

        return `
      <article class="month-cell ${isCurrentMonth ? "" : "is-muted"}">
        <button
          class="month-day ${isToday ? "is-today" : ""}"
          data-action="day"
          data-date="${dateKey(day)}"
          aria-label="${escapeHtml(formatDay(day, this.locale))}"
        >
          <span>${day.getDate()}</span>
        </button>

        <div class="month-events">
          ${dayEvents
                .slice(0, 3)
                .map(
                    (event) => `
                <button
                  class="month-event"
                  data-action="event"
                  data-event-id="${escapeHtml(event.id)}"
                  style="--event-color: ${safeColor(event.color)}"
                  title="${escapeHtml(event.title)}"
                >
                  <i></i>
                  <span>${escapeHtml(event.title)}</span>
                </button>
              `,
                )
                .join("")}

          ${dayEvents.length > 3
                ? `<span class="more-events">+${dayEvents.length - 3}</span>`
                : ""
            }
        </div>
      </article>
    `;
    }

    private renderTimeline(): string {
        const days =
            this._view === "day"
                ? [this._activeDate]
                : Array.from({ length: 7 }, (_, index) =>
                    addDays(startOfWeek(this._activeDate), index),
                );

        const minWidth = this._view === "day" ? 720 : 980;

        const header = `
      <div
        class="timeline-header"
        style="--day-count: ${days.length}; --timeline-min-width: ${minWidth}px"
      >
        <div class="time-head"></div>

        <div
          class="day-head-grid"
          style="--day-count: ${days.length}"
        >
          ${days
                .map(
                    (day) => `
                <button
                  class="timeline-day-button ${sameDay(day, new Date()) ? "is-today" : ""
                        }"
                  data-action="day"
                  data-date="${dateKey(day)}"
                >
                  <span>${escapeHtml(
                            new Intl.DateTimeFormat(this.locale, {
                                weekday: "short",
                            }).format(day),
                        )}</span>
                  <strong>${day.getDate()}</strong>
                </button>
              `,
                )
                .join("")}
        </div>
      </div>
    `;

        const axis = Array.from({ length: 24 }, (_, hour) => {
            return `
        <div class="hour-label" style="top: ${hour * HOUR_HEIGHT}px">
          ${pad(hour)}:00
        </div>
      `;
        }).join("");

        const tracks = days
            .map((day) => this.renderDayTrack(day))
            .join("");

        return `
      <section class="timeline-scroll">
        <div class="timeline">
          ${header}

          <div
            class="timeline-body"
            style="--day-count: ${days.length}; --timeline-min-width: ${minWidth}px"
          >
            <div class="time-axis" aria-hidden="true">
              ${axis}
            </div>

            <div
              class="day-tracks"
              style="--day-count: ${days.length}"
            >
              ${tracks}
            </div>
          </div>
        </div>
      </section>
    `;
    }

    private renderDayTrack(day: Date): string {
        const key = dateKey(day);
        const slotsCount = (24 * 60) / this._slotMinutes;

        const slots = Array.from({ length: slotsCount }, (_, index) => {
            const minute = index * this._slotMinutes;
            const top = (minute / 60) * HOUR_HEIGHT;
            const height = (this._slotMinutes / 60) * HOUR_HEIGHT;

            return `
        <button
          class="slot-hit"
          data-action="slot"
          data-date="${key}"
          data-minute="${minute}"
          style="top: ${top}px; height: ${height}px"
          aria-label="${escapeHtml(
                `${formatDay(day, this.locale)}, ${pad(
                    Math.floor(minute / 60),
                )}:${pad(minute % 60)}`,
            )}"
        ></button>
      `;
        }).join("");

        const events = this.eventsForDay(day)
            .map((event) => this.renderTimelineEvent(event, day))
            .join("");

        return `
      <div class="day-track" data-date="${key}">
        ${slots}
        ${events}
      </div>
    `;
    }

    private renderTimelineEvent(
        event: Schedule,
        day: Date,
    ): string {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        let top = 0;
        let height = 36;

        if (!event.allDay) {
            const start = Math.max(
                event.start.getTime(),
                dayStart.getTime(),
            );

            const end = Math.min(
                event.end.getTime(),
                dayEnd.getTime(),
            );

            const startMinutes =
                (start - dayStart.getTime()) / 60_000;

            const endMinutes =
                (end - dayStart.getTime()) / 60_000;

            top = (startMinutes / 60) * HOUR_HEIGHT;
            height = Math.max(
                28,
                ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT,
            );
        }

        return `
      <button
        class="schedule-event ${event.allDay ? "is-all-day" : ""}"
        data-action="event"
        data-event-id="${escapeHtml(event.id)}"
        style="
          top: ${top}px;
          height: ${height}px;
          --event-color: ${safeColor(event.color)};
        "
        title="${escapeHtml(event.title)}"
      >
        <strong>${escapeHtml(event.title)}</strong>
        ${!event.allDay
                ? `
              <small>
                ${formatTime(event.start, this.locale)}
                —
                ${formatTime(event.end, this.locale)}
              </small>
            `
                : `<small>Весь день</small>`
            }
      </button>
    `;
    }

    private eventsForDay(day: Date): Schedule[] {
        const start = startOfDay(day);
        const end = endOfDay(day);

        return this._events
            .filter((event) => {
                return event.start < end && event.end > start;
            })
            .sort((a, b) => a.start.getTime() - b.start.getTime());
    }

    private bindTimeline(): void {
        const tracks = this.root.querySelectorAll(".day-track");

        tracks.forEach((track) => {
            track.addEventListener("pointerdown", this.onPointerDown);
        });
    }

    private createSchedule(
        dayKeyValue: string,
        startMinute: number,
        endMinute: number,
    ): void {
        const title = window.prompt("Название расписания:");

        if (!title?.trim()) {
            return;
        }

        const day = fromDateKey(dayKeyValue);

        const start = new Date(day.getTime());
        start.setMinutes(startMinute);

        const end = new Date(day.getTime());
        end.setMinutes(Math.min(endMinute, 24 * 60));

        const schedule = normalizeSchedule({
            title: title.trim(),
            start,
            end,
            color: "#2563eb",
        });

        this._events = [...this._events, schedule];

        this.render();

        this.emit("schedule-create", {
            event: schedule,
            events: this.events,
        });
    }

    private editSchedule(id: string): void {
        const current = this._events.find((event) => event.id === id);

        if (!current) {
            return;
        }

        const title = window.prompt(
            "Название расписания:",
            current.title,
        );

        if (title === null) {
            return;
        }

        if (!title.trim()) {
            const shouldDelete = window.confirm(
                "Удалить это расписание?",
            );

            if (!shouldDelete) {
                return;
            }

            this._events = this._events.filter(
                (event) => event.id !== id,
            );

            this.render();

            this.emit("schedule-change", {
                action: "delete",
                event: current,
                events: this.events,
            });

            return;
        }

        const updated: Schedule = {
            ...current,
            title: title.trim(),
        };

        this._events = this._events.map((event) =>
            event.id === id ? updated : event,
        );

        this.render();

        this.emit("schedule-change", {
            action: "update",
            event: updated,
            events: this.events,
        });
    }
}

if (!customElements.get("calendar-scheduler")) {
    customElements.define("calendar-scheduler", CalendarScheduler);
}

declare global {
    interface HTMLElementTagNameMap {
        "calendar-scheduler": CalendarScheduler;
    }
}
