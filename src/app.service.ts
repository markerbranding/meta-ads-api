import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import { getMetaClients } from './meta/config/meta-clients.config';


@Injectable()
export class AppService {
  async getMetaAdsData(cliente: string, start?: string, end?: string): Promise<any> {
    console.log('Desde .env:', process.env.CLIENTE1_TOKEN, process.env.CLIENTE1_ACCOUNT_ID);
    const metaClients = getMetaClients(); // ✅ Esto lo evaluamos ya con .env cargado
    const client = metaClients[cliente];
    console.log('Cliente:', cliente);
    console.log('Token:', client?.token);
    console.log('Account ID:', client?.adAccountId);

    if (!client) {
      throw new NotFoundException(`Cliente "${cliente}" no está configurado`);
    }

    const since = start || dayjs().subtract(7, 'day').format('YYYY-MM-DD');
    const until = end || dayjs().format('YYYY-MM-DD');

    const url = `https://graph.facebook.com/v19.0/${client.adAccountId}/insights`;

    const params = {
      access_token: client.token,
      time_range: JSON.stringify({ since, until }),
      fields: 'campaign_name,impressions,clicks,spend,cpc,ctr,date_start,date_stop',
      level: 'campaign',
    };

    try {
      const response = await axios.get(url, { params });
      return response.data.data.map((item) => ({
        campaign: item.campaign_name,
        date: item.date_start,
        impressions: parseInt(item.impressions, 10),
        clicks: parseInt(item.clicks, 10),
        spend: parseFloat(item.spend),
        cpc: parseFloat(item.cpc),
        ctr: parseFloat(item.ctr),
      }));
    } catch (error) {
      console.error('Error al consultar Meta Ads:', error.response?.data || error.message);
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