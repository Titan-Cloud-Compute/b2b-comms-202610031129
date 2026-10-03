/** Contract types for Story: shared-channel. Plain types only — no runtime code. */

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

export interface CreateSharedChannelRequest {
  name: string;
  /** Customer emails to add as CUSTOMER members. */
  customerEmails?: string[];
}

export interface AddSharedChannelMemberRequest {
  email: string;
}

export interface PostSharedChannelMessageRequest {
  body: string;
}
