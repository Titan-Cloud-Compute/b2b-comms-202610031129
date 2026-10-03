/** Mirrors backend/src/shared/contracts/shared-channel (web has no @contracts root yet). */
export type SharedChannelMemberRole = 'VENDOR' | 'CUSTOMER';

export interface SharedChannelMemberDto {
  userId: string;
  email: string;
  role: SharedChannelMemberRole;
}

export interface SharedChannelDto {
  id: string;
  name: string;
  createdById: string;
  createdAt: string;
  members: SharedChannelMemberDto[];
}

export interface SharedChannelMessageDto {
  id: string;
  channelId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}
