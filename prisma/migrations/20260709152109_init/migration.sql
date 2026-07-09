-- CreateTable
CREATE TABLE "OwnerAssignment" (
    "workflowId" TEXT NOT NULL PRIMARY KEY,
    "team" TEXT NOT NULL,
    "slackChannelId" TEXT,
    "slackChannelName" TEXT,
    "escalationChannelId" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "reasoning" TEXT,
    "source" TEXT NOT NULL DEFAULT 'inferred',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WorkflowLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkflowSnapshot" (
    "workflowId" TEXT NOT NULL PRIMARY KEY,
    "hash" TEXT NOT NULL,
    "json" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SlackInstall" (
    "teamId" TEXT NOT NULL PRIMARY KEY,
    "botToken" TEXT NOT NULL,
    "botUserId" TEXT NOT NULL,
    "installedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BriefItemState" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WorkflowLink_fromId_idx" ON "WorkflowLink"("fromId");

-- CreateIndex
CREATE INDEX "WorkflowLink_toId_idx" ON "WorkflowLink"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowLink_fromId_toId_relation_key" ON "WorkflowLink"("fromId", "toId", "relation");
