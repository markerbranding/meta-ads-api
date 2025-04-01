import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import { getMetaClients } from './meta/config/meta-clients.config';


@Injectable()
export class AppService {
  async getMetaAdsData(cliente: string, start?: string, end?: string) {
  const clients = getMetaClients();
  const client = clients[cliente];

  if (!client) {
    throw new NotFoundException(`Cliente '${cliente}' no encontrado`);
  }

  const { token, adAccountId } = client;

  const today = dayjs().format('YYYY-MM-DD');
  const startDate = start || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
  const endDate = end || today;

  try {
    const response = await axios.get(`https://graph.facebook.com/v19.0/${adAccountId}/ads`, {
      params: {
        fields: 'id,name,insights.time_increment(1){date_start,impressions,clicks,spend,cpc,ctr}',
        access_token: token,
        effective_status: ['ACTIVE', 'PAUSED'],
        limit: 100,
      },
    });

    const ads = response.data.data;

    const results: {
      ad_id: string;
      campaign: string;
      date: string;
      impressions: number;
      clicks: number;
      spend: number;
      cpc: number;
      ctr: number;
    }[] = [];

    for (const ad of ads) {
      const insights = ad.insights?.data || [];

      insights.forEach((entry) => {
        const { date_start, impressions, clicks, spend, cpc, ctr } = entry;
        const entryDate = date_start;

        if (entryDate >= startDate && entryDate <= endDate) {
          results.push({
            ad_id: ad.id,
            campaign: ad.name,
            date: entryDate,
            impressions: parseInt(impressions),
            clicks: parseInt(clicks),
            spend: parseFloat(spend),
            cpc: parseFloat(cpc),
            ctr: parseFloat(ctr),
          });
        }
      });
    }

    return results;
  } catch (error) {
    console.error('❌ Error al consultar Meta Ads:', JSON.stringify(error.response?.data || error.message));
    throw new InternalServerErrorException('Error al consultar la API de Meta');
  }
}


  


  async exchangeToken(): Promise<any> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const shortLivedToken = process.env.META_SHORT_LIVED_TOKEN;

    const url = 'https://graph.facebook.com/v19.0/oauth/access_token';

    try {
      const response = await axios.get(url, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: appId,
          client_secret: appSecret,
          fb_exchange_token: shortLivedToken,
        },
      });

      const longLivedToken = response.data.access_token;
      const expiresIn = response.data.expires_in;
      const expireDate = dayjs().add(expiresIn, 'second').format('YYYY-MM-DD');

      const content = `# Generado automáticamente el ${dayjs().format('YYYY-MM-DD')}
CLIENTE1_TOKEN=${longLivedToken}
# Expira el ${expireDate}
`;

      const envPath = path.resolve(__dirname, '../.env.generated');

      fs.writeFileSync(envPath, content);

      console.log('\n✅ Nuevo token guardado en .env.generated');
      console.log(`💡 Expira el: ${expireDate}\n`);

      return {
        message: 'Token generado correctamente',
        token: longLivedToken,
        expiresInDays: Math.round(expiresIn / 86400),
        expiresAt: expireDate,
        savedTo: envPath,
      };
    } catch (error) {
      console.error('❌ Error al intercambiar token:', error.response?.data || error.message);
      throw new InternalServerErrorException('No se pudo obtener el token largo');
    }
  }




  async getAdCreatives(cliente: string) {
    const clients = getMetaClients();
    const client = clients[cliente];
  
    if (!client) {
      throw new NotFoundException(`Cliente '${cliente}' no encontrado`);
    }
  
    const { token, adAccountId } = client;
  
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/${adAccountId}/ads`, {
        params: {
          fields: 'name,creative{thumbnail_url,name}', // ✅ ESTA LÍNEA AHORA ESTÁ BIEN
          access_token: token,
          effective_status: ['ACTIVE', 'PAUSED'],
          limit: 25,
        },
      });
  
      return response.data.data.map(ad => ({
        ad_id: ad.id,
        name: ad.name,
        thumbnail_url: ad.creative?.thumbnail_url || null,
      }));
    } catch (error) {
      console.error('❌ Error al obtener creatives:', error.response?.data || error.message);
      throw new InternalServerErrorException('Error al consultar los creatives de Meta Ads');
    }
  }

}