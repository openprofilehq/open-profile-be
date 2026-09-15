import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invite } from '../../invites/entities/invite.entity';

const CONVERSION_IN_WINDOW_SQL = `
  SELECT
    COUNT(*) FILTER (WHERE "createdAt" >= $1 AND "createdAt" < $2) AS sent,
    COUNT(*) FILTER (WHERE "claimedAt" >= $1 AND "claimedAt" < $2) AS claimed
  FROM invites
`;

export interface ConversionRow {
  sent: string;
  claimed: string;
}

@Injectable()
export class InviteMetricAction extends AbstractModelAction<Invite> {
  constructor(
    @InjectRepository(Invite)
    repo: Repository<Invite>,
  ) {
    super(repo, Invite);
  }

  async conversionInWindow(start: Date, end: Date): Promise<ConversionRow> {
    const rows = await this.repository.query<ConversionRow[]>(
      CONVERSION_IN_WINDOW_SQL,
      [start, end],
    );
    return rows[0];
  }
}
