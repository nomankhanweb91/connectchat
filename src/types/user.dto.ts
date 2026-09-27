export interface PublicUserDto {
  id: string;
  username: string;
  name: string;
  country: string;
  city: string;
  gender: string;
  profileImageUrl: string | null;
  isVerified: boolean;
  isOnline: boolean;
  lastSeen: Date | null;
}

