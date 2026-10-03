-- Story: customer-invite — admin-issued customer invitations.
-- The activation token is a RegistrationToken (auth table, unchanged); this
-- table only tracks who was invited, by whom, and the invite lifecycle.

-- CreateTable
CREATE TABLE "CustomerInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerInvite_token_key" ON "CustomerInvite"("token");

-- CreateIndex
CREATE INDEX "CustomerInvite_email_idx" ON "CustomerInvite"("email");
