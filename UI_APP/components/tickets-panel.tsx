"use client";

const TICKETS_URL = "https://tally.so/r/obl1rV";

export function TicketsPanel() {
  return (
    <div className="h-full min-h-0 bg-emerald-50 p-3 text-emerald-950 sm:p-4">
      <div
        className="h-full overflow-hidden rounded-lg border border-emerald-900/20 bg-white shadow-sm"
        data-tour="tickets-form"
      >
        <iframe
          src={TICKETS_URL}
          title="ARRPSAT GREEN ticketing"
          className="h-full w-full"
        />
      </div>
    </div>
  );
}
