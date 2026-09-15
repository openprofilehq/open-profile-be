import { EventType } from '../../events/entities/event.entity';
import { MetricType } from '../enums/metric-type.enum';

export const METRIC_TYPE_ENUM_SQL = '"public"."daily_metrics_metrictype_enum"';

export const TRACKED_EVENT_METRICS: Readonly<Record<string, MetricType>> = {
  [EventType.PROFILE_VIEWED]: MetricType.PROFILE_VIEWS,
  [EventType.LINK_CLICKED]: MetricType.LINK_CLICKS,
  [EventType.SEARCH_PERFORMED]: MetricType.SEARCH_EVENTS,
  [EventType.INVITE_SENT]: MetricType.INVITES,
};

const trackedEventTypes = Object.keys(TRACKED_EVENT_METRICS);

export const TRACKED_EVENT_TYPES_SQL = trackedEventTypes
  .map((type) => `'${type}'`)
  .join(', ');

export function buildMetricTypeCaseSql(column: string): string {
  const branches = trackedEventTypes
    .map((type) => `WHEN '${type}' THEN '${TRACKED_EVENT_METRICS[type]}'`)
    .join('\n      ');
  return `CAST(CASE ${column}\n      ${branches}\n    END AS ${METRIC_TYPE_ENUM_SQL})`;
}
