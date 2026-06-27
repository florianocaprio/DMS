import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

/**
 * Configurazione delle verifiche di integrità schedulate.
 * frequency: once | daily | weekly | monthly | yearly
 */
export const integritySchedulesTable = pgTable("integrity_schedules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  frequency: text("frequency").notNull().default("weekly"),
  cronExpression: text("cron_expression").notNull(),
  hour: integer("hour").notNull().default(2),
  minute: integer("minute").notNull().default(0),
  dayOfWeek: integer("day_of_week"),      // 0=Dom … 6=Sab; null se non weekly
  dayOfMonth: integer("day_of_month"),    // 1-31; null se non monthly/yearly
  monthOfYear: integer("month_of_year"),  // 1-12; null se non yearly
  enabled: boolean("enabled").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
