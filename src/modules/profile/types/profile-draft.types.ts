import { ProfileContentDto } from '../dto/profile-content.dto';

export interface DraftResponse {
  status: 'success';
  message: string;
  data: {
    profileId: string;
    bio: string | null;
    photoUrl: string | null;
    content: ProfileContentDto | null;
    updatedAt: Date;
  };
}
