-- Story: shared-channel. Adds Customer, SharedChannel, SharedChannelMember and
-- Message. Auth tables are NOT altered (user ids are stored as plain text).

CREATE TYPE "SharedChannelRole" AS ENUM ('VENDOR', 'CUSTOMER');

CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

CREATE TABLE "SharedChannel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedChannel_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SharedChannel_createdById_idx" ON "SharedChannel"("createdById");

CREATE TABLE "SharedChannelMember" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "SharedChannelRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SharedChannelMember_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedChannelMember_channelId_userId_key" ON "SharedChannelMember"("channelId", "userId");
CREATE INDEX "SharedChannelMember_userId_idx" ON "SharedChannelMember"("userId");
ALTER TABLE "SharedChannelMember" ADD CONSTRAINT "SharedChannelMember_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");
ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
    FOREIGN KEY ("channelId") REFERENCES "SharedChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
