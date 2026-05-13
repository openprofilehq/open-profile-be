import { BadRequestException, Injectable } from '@nestjs/common';
import { SearchAction } from './actions/search.action';
@Injectable()
export class SearchService {
  constructor(private readonly searchAction: SearchAction) {}

  async searchProfiles(q?: string) {
    const query = q?.trim();

    if (!query || query.length < 2) {
      throw new BadRequestException(
        'Please enter at least 2 characters to search.',
      );
    }

    const results = await this.searchAction.searchProfiles(query);

    return {
      results: results.map((row) => ({
        username: row.username,
        fullName: row.fullName,
        bio: row.bio?.slice(0, 120) ?? '',
        photoUrl: row.photoUrl,
        isVerified: row.isVerified,
      })),
      total: results.length,
    };
  }
}
