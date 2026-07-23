-- Add Event.eventVideoUrl column.
-- Backs the "Event Video" section on the Manage Agenda tab (admin) and
-- the embedded "Event Video" card above "The lineup" on the public
-- Speakers & Agenda tab. Nullable — null means no event video set.

ALTER TABLE "Event" ADD COLUMN "eventVideoUrl" TEXT;
