import cron from 'node-cron';
import { prisma } from '../index';
import { getCoaClient } from './coaClient';
import { detectSeller } from './sellerDetection';
import { mapCoaToProductFields } from '../utils/coaMapper';

let cronJob: cron.ScheduledTask | null = null;

/**
 * Poll the CoA backend for new email ingestions and create CoaSyncRecords.
 * Each ingestion may have multiple CoA PDF attachments, each creating a job.
 */
async function pollEmailIngestions(): Promise<{ processed: number; errors: number }> {
  let processed = 0;
  let errors = 0;

  try {
    const coaClient = getCoaClient();

    // Fetch ingestions in "review" status (CoA processing complete, awaiting admin)
    const ingestions = await coaClient.listEmailIngestions('review');

    for (const ingestion of ingestions) {
      try {
        // Process each CoA attachment that has a completed job
        for (const attachment of ingestion.attachments) {
          if (!attachment.job_id) continue;
          if (attachment.attachment_type === 'product_photo') continue;

          // Check if we already have a sync record for this job
          const existing = await prisma.coaSyncRecord.findUnique({
            where: { coaJobId: attachment.job_id },
          });
          if (existing) continue;

          // Get the job status
          const job = await coaClient.getJobStatus(attachment.job_id);
          if (!job) continue;

          // Get extracted product data if available
          let coaProductName: string | null = null;
          let producerName: string | null = null;
          let rawData: Record<string, any> | null = null;

          if (job.product_id) {
            const productDetail = await coaClient.getProductDetail(job.product_id);
            if (productDetail) {
              coaProductName = productDetail.name;
              producerName = productDetail.producer || null;
              const mapped = mapCoaToProductFields(productDetail);
              rawData = {
                coaProductId: productDetail.id,
                mappedFields: mapped,
                rawCoaProduct: {
                  name: productDetail.name,
                  strain_type: productDetail.strain_type,
                  lot_number: productDetail.lot_number,
                  producer: productDetail.producer,
                  lab: productDetail.lab,
                  test_date: productDetail.test_date,
                  report_number: productDetail.report_number,
                },
              };
            }
          }

          // Run seller detection
          const sellerMatch = await detectSeller({
            senderEmail: ingestion.sender,
            companyName: ingestion.suggested_client || ingestion.confirmed_client,
            producerName,
          });

          // Create sync record
          await prisma.coaSyncRecord.create({
            data: {
              coaJobId: attachment.job_id,
              coaProductId: job.product_id,
              emailIngestionId: ingestion.id,
              status: job.product_id ? 'ready' : 'processing',
              suggestedSellerId: sellerMatch?.userId || null,
              suggestedSellerName: sellerMatch ? undefined : null,
              confidence: sellerMatch?.confidence || null,
              matchReason: sellerMatch?.reason || null,
              emailSender: ingestion.sender,
              emailSubject: ingestion.subject,
              coaProductName,
              rawData: rawData || undefined,
            },
          });

          processed++;
        }
      } catch (err: any) {
        console.error(`[COA-EMAIL] Error processing ingestion ${ingestion.id}:`, err?.message);
        errors++;
      }
    }

    if (processed > 0) {
      console.log(`[COA-EMAIL] Processed ${processed} new email attachments, ${errors} errors`);
    }
  } catch (err: any) {
    console.error('[COA-EMAIL] Poll failed:', err?.message);
  }

  return { processed, errors };
}

/**
 * Start the email sync cron job (every 5 minutes).
 * Only starts if COA_API_URL is configured.
 */
export function startCoaEmailSync() {
  if (cronJob) return;

  cronJob = cron.schedule('*/5 * * * *', async () => {
    try {
      await pollEmailIngestions();
    } catch (err) {
      console.error('[COA-EMAIL] Cron error:', err);
    }
  });

  console.log('[COA-EMAIL] Cron scheduled: every 5 minutes');
}

export function stopCoaEmailSync() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[COA-EMAIL] Cron stopped');
  }
}

// Export for manual trigger
export { pollEmailIngestions };
