-- AlterTable: make coaJobId nullable for email-body-extracted products
ALTER TABLE "CoaSyncRecord" ALTER COLUMN "coaJobId" DROP NOT NULL;

-- AlterTable: add sourceType field to distinguish coa_pdf vs email_body
ALTER TABLE "CoaSyncRecord" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'coa_pdf';
