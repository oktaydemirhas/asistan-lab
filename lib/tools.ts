// Mock airline back office. State is in memory; resetState() makes eval runs repeatable.

type Booking = { flight: string; route: string; date: string; scheduled: string; status: string; newDeparture?: string; seat: string; pkg: string };

const SEED: Record<string, Booking> = {
  ANK123: { flight: "AK1204", route: "İstanbul - İzmir", date: "2026-11-05", scheduled: "08:30", status: "Rötarlı", newDeparture: "09:45", seat: "14C", pkg: "Standart" },
  ANK456: { flight: "AK2210", route: "İstanbul - Ankara", date: "2026-11-06", scheduled: "18:10", status: "Zamanında", seat: "7A", pkg: "Esnek" },
};
const SEED_TAKEN = ["12A", "12B", "3C"];

let bookings: Record<string, Booking> = structuredClone(SEED);
let taken = new Set(SEED_TAKEN);

export function resetState() {
  bookings = structuredClone(SEED);
  taken = new Set(SEED_TAKEN);
}

export const toolDefs = [
  {
    type: "function",
    function: {
      name: "get_flight_status",
      description: "PNR kodu ile uçuş durumunu (zamanında, rötarlı, yeni kalkış saati) sorgular.",
      parameters: { type: "object", properties: { pnr: { type: "string", description: "6 karakterlik rezervasyon kodu, örn. ANK123" } }, required: ["pnr"] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_in",
      description: "PNR için istenen koltuğa online check-in yapar.",
      parameters: {
        type: "object",
        properties: {
          pnr: { type: "string", description: "6 karakterlik rezervasyon kodu" },
          seat: { type: "string", description: "Koltuk, örn. 12C" },
        },
        required: ["pnr", "seat"],
      },
    },
  },
] as const;

export function runTool(name: string, args: Record<string, unknown>): Record<string, unknown> {
  const pnr = String(args.pnr ?? "").toUpperCase();
  const b = bookings[pnr];
  if (!b) return { ok: false, error: `PNR bulunamadı: ${pnr}` };

  if (name === "get_flight_status") {
    return { ok: true, pnr, flight: b.flight, route: b.route, date: b.date, scheduled: b.scheduled, status: b.status, newDeparture: b.newDeparture ?? null };
  }
  if (name === "check_in") {
    const seat = String(args.seat ?? "").toUpperCase();
    if (!/^\d{1,2}[A-F]$/.test(seat)) return { ok: false, error: `Geçersiz koltuk: ${seat}` };
    if (taken.has(seat)) return { ok: false, error: `${seat} koltuğu dolu` };
    taken.add(seat);
    b.seat = seat;
    return { ok: true, pnr, seat, message: "Check-in tamamlandı" };
  }
  return { ok: false, error: `Bilinmeyen araç: ${name}` };
}
