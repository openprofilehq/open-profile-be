import { ApiProperty } from '@nestjs/swagger';

// Static Free-plan stub — becomes dynamic once the plan schema ships.
export class BillingInfoResponseDto {
  @ApiProperty({ example: 'Free' })
  plan: string;

  @ApiProperty({ type: String, example: null, nullable: true })
  nextBillingDate: string | null;
}
