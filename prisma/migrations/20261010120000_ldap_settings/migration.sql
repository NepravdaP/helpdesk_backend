-- CreateTable
CREATE TABLE "ldap_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "url" TEXT NOT NULL,
    "bindTemplate" TEXT NOT NULL,
    "searchBase" TEXT NOT NULL,
    "searchFilter" TEXT NOT NULL,
    "syncBindDn" TEXT NOT NULL DEFAULT '',
    "syncBindPasswordEnc" TEXT NOT NULL DEFAULT '',
    "syncFilter" TEXT NOT NULL,
    "groupSuperadmin" TEXT NOT NULL DEFAULT '',
    "groupAdmin" TEXT NOT NULL DEFAULT '',
    "groupIt" TEXT NOT NULL DEFAULT '',
    "groupBookingManagers" TEXT NOT NULL DEFAULT '',
    "tlsRejectUnauthorized" BOOLEAN NOT NULL DEFAULT true,
    "timeoutMs" INTEGER NOT NULL DEFAULT 5000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ldap_settings_pkey" PRIMARY KEY ("id")
);

