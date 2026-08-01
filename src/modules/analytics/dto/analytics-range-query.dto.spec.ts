import { ValidationArguments } from 'class-validator';
import {
  EndDateAfterStartDateConstraint,
  AnalyticsDateRangeQueryDto,
} from './analytics-range-query.dto';

describe('EndDateAfterStartDateConstraint', () => {
  let constraint: EndDateAfterStartDateConstraint;

  beforeEach(() => {
    constraint = new EndDateAfterStartDateConstraint();
  });

  const makeArgs = (
    dto: Partial<AnalyticsDateRangeQueryDto>,
  ): ValidationArguments =>
    ({
      object: dto,
    }) as ValidationArguments;

  it('passes when endDate is after startDate', () => {
    const args = makeArgs({ startDate: '2026-07-01' });
    expect(constraint.validate('2026-07-10', args)).toBe(true);
  });

  it('passes when endDate equals startDate', () => {
    const args = makeArgs({ startDate: '2026-07-01' });
    expect(constraint.validate('2026-07-01', args)).toBe(true);
  });

  it('fails when endDate is before startDate', () => {
    const args = makeArgs({ startDate: '2026-07-10' });
    expect(constraint.validate('2026-07-01', args)).toBe(false);
  });

  it('passes when startDate is not provided, deferring to @IsDateString for format errors', () => {
    const args = makeArgs({});
    expect(constraint.validate('2026-07-10', args)).toBe(true);
  });

  it('passes when endDate is not provided, deferring to @IsOptional/@IsDateString', () => {
    const args = makeArgs({ startDate: '2026-07-01' });
    expect(constraint.validate(undefined as unknown as string, args)).toBe(
      true,
    );
  });

  it('returns a descriptive default error message', () => {
    expect(constraint.defaultMessage()).toBe(
      'endDate must be on or after startDate',
    );
  });
});
