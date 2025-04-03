export const getMetaClients = () => ({
  cliente1: {
    token: process.env.CLIENTE1_TOKEN,
    adAccountId: process.env.CLIENTE1_ACCOUNT_ID,
    pageId: process.env.CLIENTE1_PAGE_ID,
    pageToken: process.env.CLIENTE1_PAGE_TOKEN,
    tokenExpiresAt: process.env.CLIENTE1_TOKEN_EXPIRES_AT,
    notifyEmail: process.env.CLIENTE1_NOTIFY_EMAIL,
  },
});