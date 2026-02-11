import axios from 'axios';

const ZOHO_ACCOUNTS_URL = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zohocloud.ca';
const ZOHO_API_URL = process.env.ZOHO_API_URL || 'https://www.zohoapis.ca/crm/v7';

let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get a valid Zoho OAuth access token, refreshing if expired.
 */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    },
  });

  accessToken = response.data.access_token;
  tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 min buffer
  console.log('[ZOHO] Access token refreshed');
  return accessToken!;
}

/**
 * Generic Zoho CRM API caller with support for query params.
 */
export async function zohoRequest(
  method: string,
  endpoint: string,
  options?: { data?: any; params?: Record<string, any> },
) {
  const token = await getAccessToken();
  const response = await axios({
    method,
    url: `${ZOHO_API_URL}${endpoint}`,
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    data: options?.data,
    params: options?.params,
  });
  return response.data;
}

export { ZOHO_API_URL };
