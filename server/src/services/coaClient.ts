import axios, { AxiosInstance } from 'axios';

// ─── CoA API Response Types ───

export interface CoaJobResponse {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'review' | 'published' | 'flagged' | 'error';
  created_at: string;
  updated_at: string;
  error_message: string | null;
  page_count: number;
  product_id: string | null;
  email_ingestion_id: string | null;
}

export interface CoaProductResponse {
  id: string;
  name: string;
  strain_type: string | null;
  lot_number: string;
  producer: string | null;
  lab: string;
  test_date: string | null;
  report_number: string | null;
  tier: string;
  status: 'draft' | 'review' | 'published' | 'archived';
  available: boolean;
  tags: string[];
  client_name: string | null;
  created_at: string;
  product_group_id: string | null;
  is_latest: boolean;
}

export interface CoaTestData {
  id: string;
  test_type: string;
  data: Record<string, any>;
  lab: string;
  test_date: string | null;
  method: string | null;
  overall_result: string | null;
}

export interface CoaProductDetailResponse extends CoaProductResponse {
  test_data: CoaTestData[];
}

export interface CoaEmailAttachment {
  id: string;
  original_filename: string;
  stored_filename: string;
  attachment_type: 'coa_pdf' | 'coa_photo' | 'product_photo';
  file_size: number;
  job_id: string | null;
}

export interface CoaEmailIngestion {
  id: string;
  message_id: string;
  subject: string;
  sender: string;
  body_text: string | null;
  received_at: string | null;
  status: 'pending' | 'processing' | 'review' | 'completed' | 'error';
  suggested_client: string | null;
  confirmed_client: string | null;
  error_message: string | null;
  created_at: string;
  attachments: CoaEmailAttachment[];
}

// ─── CoA Client ───

class CoaClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = process.env.COA_API_URL || 'http://localhost:8000';
    const apiKey = process.env.COA_API_KEY || '';

    this.client = axios.create({
      baseURL,
      timeout: 60000, // 60s for PDF uploads
      headers: {
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
    });
  }

  /**
   * Upload a CoA PDF to the CoA backend for processing.
   */
  async uploadCoA(
    pdfBuffer: Buffer,
    filename: string,
    clientName?: string,
  ): Promise<CoaJobResponse> {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('file', pdfBuffer, { filename, contentType: 'application/pdf' });
    if (clientName) {
      form.append('client_name', clientName);
    }

    const res = await this.client.post<CoaJobResponse>('/api/upload', form, {
      headers: form.getHeaders(),
    });
    return res.data;
  }

  /**
   * Get the status of a processing job.
   */
  async getJobStatus(jobId: string): Promise<CoaJobResponse | null> {
    try {
      const res = await this.client.get<CoaJobResponse>(`/api/jobs/${jobId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Get the extracted product from a completed job.
   */
  async getJobProduct(jobId: string): Promise<CoaProductResponse | null> {
    try {
      const res = await this.client.get<CoaProductResponse>(`/api/jobs/${jobId}/product`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Get full product detail including test data.
   */
  async getProductDetail(productId: string): Promise<CoaProductDetailResponse | null> {
    try {
      const res = await this.client.get<CoaProductDetailResponse>(`/api/products/${productId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Get the URL for a product's published PDF (for proxying).
   */
  getProductPdfUrl(productId: string): string {
    return `${this.client.defaults.baseURL}/api/products/${productId}/pdf`;
  }

  /**
   * Download a product's PDF as a buffer.
   */
  async getProductPdfBuffer(productId: string): Promise<Buffer | null> {
    try {
      const res = await this.client.get(`/api/products/${productId}/pdf`, {
        responseType: 'arraybuffer',
      });
      return Buffer.from(res.data);
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * List email ingestions, optionally filtered by status.
   */
  async listEmailIngestions(status?: string): Promise<CoaEmailIngestion[]> {
    const params: Record<string, string> = {};
    if (status) params.status = status;

    const res = await this.client.get<CoaEmailIngestion[]>('/api/email/ingestions', { params });
    return res.data;
  }

  /**
   * Get a single email ingestion by ID.
   */
  async getEmailIngestion(ingestionId: string): Promise<CoaEmailIngestion | null> {
    try {
      const res = await this.client.get<CoaEmailIngestion>(`/api/email/ingestions/${ingestionId}`);
      return res.data;
    } catch (err: any) {
      if (err?.response?.status === 404) return null;
      throw err;
    }
  }

  /**
   * Health check — returns true if the CoA backend is reachable.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.client.get('/health', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton — lazy-init only when COA_API_URL is set
let _instance: CoaClient | null = null;

export function getCoaClient(): CoaClient {
  if (!_instance) {
    _instance = new CoaClient();
  }
  return _instance;
}
