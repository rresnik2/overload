-- CreateTable
CREATE TABLE "ExerciseFavorite" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "exerciseId" UUID NOT NULL,
    "position" TEXT NOT NULL,
    "hlc" TEXT NOT NULL,
    "fieldHlc" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseFavorite_userId_version_idx" ON "ExerciseFavorite"("userId", "version");

-- CreateIndex
CREATE INDEX "ExerciseFavorite_userId_exerciseId_idx" ON "ExerciseFavorite"("userId", "exerciseId");

-- AddForeignKey
ALTER TABLE "ExerciseFavorite" ADD CONSTRAINT "ExerciseFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseFavorite" ADD CONSTRAINT "ExerciseFavorite_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

