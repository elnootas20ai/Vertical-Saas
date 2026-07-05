export interface DiningTableTicketStat {
  id: string;
  tableId: string;
  tableNumber: number;
  tableName: string;
  seatedAt: string;
  ticketAt: string;
  durationMinutes: number;
  amount: number;
  itemCount: number;
  guestCount: number;
  calendarDay: string;
  deliveryOrderId: string;
  ticketNumber: string;
  pdvId: string;
}

export interface TableStatsSummary {
  ticketCount: number;
  totalAmount: number;
  avgDurationMinutes: number;
  avgTicketAmount: number;
  avgGuests: number;
}

export interface TableStatsByTableRow extends TableStatsSummary {
  tableId: string;
  tableNumber: number;
  tableName: string;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeTableTicketStats(rows: DiningTableTicketStat[]): TableStatsSummary {
  if (!rows.length) {
    return { ticketCount: 0, totalAmount: 0, avgDurationMinutes: 0, avgTicketAmount: 0, avgGuests: 0 };
  }
  const ticketCount = rows.length;
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const totalDuration = rows.reduce((s, r) => s + Number(r.durationMinutes || 0), 0);
  const totalGuests = rows.reduce((s, r) => s + Number(r.guestCount || 0), 0);
  return {
    ticketCount,
    totalAmount: round1(totalAmount),
    avgDurationMinutes: round1(totalDuration / ticketCount),
    avgTicketAmount: round1(totalAmount / ticketCount),
    avgGuests: round1(totalGuests / ticketCount),
  };
}

export function groupTableTicketStatsByTable(rows: DiningTableTicketStat[]): TableStatsByTableRow[] {
  const map = new Map<string, DiningTableTicketStat[]>();
  for (const row of rows) {
    const key = row.tableId || `num:${row.tableNumber}`;
    const list = map.get(key) || [];
    list.push(row);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([, group]) => {
      const first = group[0];
      return {
        tableId: first.tableId,
        tableNumber: first.tableNumber,
        tableName: first.tableName || (first.tableNumber ? `Mesa ${first.tableNumber}` : ''),
        ...summarizeTableTicketStats(group),
      };
    })
    .sort((a, b) => a.tableNumber - b.tableNumber);
}

export function formatDurationMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
}
