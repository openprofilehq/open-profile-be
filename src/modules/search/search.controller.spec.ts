jest.mock('../../config/env', () => ({
  env: {},
}));

import { SearchController } from './search.controller';
import { SearchService } from './search.service';

describe('SearchController', () => {
  let controller: SearchController;
  let searchService: jest.Mocked<Pick<SearchService, 'searchProfiles'>>;

  beforeEach(async () => {
    searchService = {
      searchProfiles: jest.fn(),
    };

    controller = new SearchController(
      searchService as unknown as SearchService,
    );
  });

  it('delegates search requests to SearchService', async () => {
    const dto = { q: 'ada', page: 1, limit: 5 };
    const result = {
      results: [],
      total: 0,
      page: 1,
      limit: 5,
      totalPages: 0,
    };
    searchService.searchProfiles.mockResolvedValue(result);

    await expect(controller.search(dto)).resolves.toEqual(result);
    expect(searchService.searchProfiles).toHaveBeenCalledWith(dto);
  });
});
