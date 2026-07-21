-- Add Testimonial + TestimonialLike tables.
-- These back the /testimonials community feed and the /admin/testimonials
-- moderation view. The application code (src/app/api/testimonials/*, 
-- src/components/testimonials/*) already existed but the tables were
-- never created in the DB, so the feature was broken at runtime.

CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "imageUrl" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventId" TEXT,
    "speakerId" TEXT,
    "agendaItemId" TEXT,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestimonialLike" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "testimonialId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestimonialLike_pkey" PRIMARY KEY ("id")
);

-- Relations (foreign keys)
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_speakerId_fkey"
    FOREIGN KEY ("speakerId") REFERENCES "Speaker"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Testimonial" ADD CONSTRAINT "Testimonial_agendaItemId_fkey"
    FOREIGN KEY ("agendaItemId") REFERENCES "EventAgendaItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestimonialLike" ADD CONSTRAINT "TestimonialLike_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestimonialLike" ADD CONSTRAINT "TestimonialLike_testimonialId_fkey"
    FOREIGN KEY ("testimonialId") REFERENCES "Testimonial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique constraint: one like per user per testimonial
CREATE UNIQUE INDEX "TestimonialLike_userId_testimonialId_key"
    ON "TestimonialLike"("userId", "testimonialId");

-- Indexes for common query patterns
CREATE INDEX "Testimonial_authorId_createdAt_idx" ON "Testimonial"("authorId", "createdAt");
CREATE INDEX "Testimonial_eventId_idx" ON "Testimonial"("eventId");
CREATE INDEX "Testimonial_speakerId_idx" ON "Testimonial"("speakerId");
CREATE INDEX "Testimonial_agendaItemId_idx" ON "Testimonial"("agendaItemId");
CREATE INDEX "Testimonial_hidden_createdAt_idx" ON "Testimonial"("hidden", "createdAt");
CREATE INDEX "Testimonial_featured_createdAt_idx" ON "Testimonial"("featured", "createdAt");
CREATE INDEX "Testimonial_likeCount_idx" ON "Testimonial"("likeCount");
CREATE INDEX "TestimonialLike_testimonialId_idx" ON "TestimonialLike"("testimonialId");
