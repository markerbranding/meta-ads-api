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
          fields: `id,name,campaign_id,created_time,updated_time,insights.time_range({since:'${startDate}',until:'${endDate}'}){impressions,reach,clicks,spend,cpc,ctr,actions,cost_per_action_type}`,
          access_token: token,
          effective_status: ['ACTIVE', 'PAUSED'],
          limit: 100,
        },
      });
  
      const ads = response.data.data;
  
      const results: {
        ad_id: string;
        campaign: string;
        campaign_id: string;
        rango_fechas: string;
        created_time: string;
        updated_time: string;
        impressions: number;
        reach: number;
        clicks: number;
        spend: number;
        cpc: number;
        ctr: number;
        leads: number;
        cpa_lead: number;
        objective?: string; // <- lo preparamos para el siguiente paso
      }[] = [];

      const campaignIdsSet = new Set<string>();
      ads.forEach(ad => {
        if (ad.campaign_id) {
          campaignIdsSet.add(ad.campaign_id);
        }
      });
      const campaignIds = Array.from(campaignIdsSet);


      const campaignObjectives: Record<string, string> = {};

      if (campaignIds.length > 0) {
        const campaignResponse = await axios.get(`https://graph.facebook.com/v19.0`, {
          params: {
            ids: campaignIds.join(','),
            fields: 'objective',
            access_token: token,
          },
        });

        const campaignData = campaignResponse.data;
        for (const campaignId of campaignIds) {
          campaignObjectives[campaignId] = campaignData[campaignId]?.objective || '';
        }
      }

      const objectiveMap: Record<string, string> = {
        LEAD_GENERATION: 'Clientes potenciales',
        OUTCOME_LEADS: 'Clientes potenciales',
        OUTCOME_TRAFFIC: 'Tráfico',
        OUTCOME_ENGAGEMENT: 'Interacción',
        OUTCOME_SALES: 'Ventas',
        OUTCOME_AWARENESS: 'Alcance',
        REACH: 'Alcance',
        LINK_CLICKS: 'Clics en enlace',
        CONVERSIONS: 'Conversiones',
        // Agrega más según tus campañas
      };
  
      for (const ad of ads) {
        const insights = ad.insights?.data?.[0];
        if (!insights) continue;

        const actions = insights.actions || [];
        const costPerAction = insights.cost_per_action_type || [];

        const leadActionTypes = [
          'lead',
          'offsite_conversion.fb_pixel_lead',
          'omni_lead',
          'onsite_conversion.lead_grouped',
        ];

        const leadsRaw = actions.find(a => leadActionTypes.includes(a.action_type))?.value;
        const costPerLeadRaw = costPerAction.find(a => leadActionTypes.includes(a.action_type))?.value;

        const leads = leadsRaw ? parseFloat(leadsRaw) : 0;
        const costPerLead = costPerLeadRaw ? parseFloat(costPerLeadRaw) : 0;


        
        results.push({
          ad_id: ad.id,
          campaign: ad.name,
          campaign_id: ad.campaign_id,
          created_time: ad.created_time,
          updated_time: ad.updated_time,
          rango_fechas: `${startDate} a ${endDate}`,
          reach: parseInt(insights.reach),
          impressions: parseInt(insights.impressions),
          clicks: parseInt(insights.clicks),
          spend: parseFloat(insights.spend),
          cpc: parseFloat(insights.cpc),
          ctr: parseFloat(insights.ctr),
          leads,
          cpa_lead: costPerLead,
          objective: objectiveMap[campaignObjectives[ad.campaign_id]] || campaignObjectives[ad.campaign_id] || '',
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








  async getPageInsights(cliente: string, start?: string, end?: string) {
    const clients = getMetaClients();
    const client = clients[cliente];
  
    if (!client || !client.pageId || !client.pageToken) {
      throw new NotFoundException(`Cliente '${cliente}' o 'pageId/pageToken' no encontrado`);
    }
  
    const { pageToken, pageId } = client;
  
    const fechaLimite = dayjs().subtract(90, 'day').startOf('day');
    let startDate = dayjs(start || fechaLimite).startOf('month');
    const endDate = dayjs(end || dayjs()).endOf('month');
  
    let rangoAjustado = false;
  
    if (startDate.isBefore(fechaLimite)) {
      startDate = fechaLimite;
      rangoAjustado = true;
    }
  
    const monthlyData: {
      cliente: string;
      mes: string;
      seguidores_totales: number | string;
      nuevos_seguidores: number | string;
      publicaciones: number | string;
      likes_pagina: number | string;
      impresiones_totales: number | string;
      alcance_total: number | string;
      rango_ajustado?: boolean;
    }[] = [];
  
    const metrics = [
      'page_fans',
      'page_fan_adds_unique',
      'page_impressions',
      'page_total_reach',
    ];
  
    const getMonthlyMetric = async (metric: string, since: string, until: string) => {
      try {
        const url = `https://graph.facebook.com/v19.0/${pageId}/insights/${metric}`;
        const response = await axios.get(url, {
          params: {
            access_token: pageToken,
            since,
            until,
          },
        });
  
        return response.data?.data?.[0]?.values?.[0]?.value || 0;
      } catch (error) {
        console.error(`❌ Métrica fallida '${metric}' (${since} - ${until}):`, error.response?.data || error.message);
        return 'No disponible';
      }
    };
  
    const getMonthlyPosts = async (since: string, until: string) => {
      try {
        const response = await axios.get(`https://graph.facebook.com/v19.0/${pageId}/posts`, {
          params: {
            access_token: pageToken,
            since,
            until,
            fields: 'id',
            limit: 100,
          },
        });
  
        return response.data?.data?.length || 0;
      } catch (error) {
        console.error(`❌ Error al contar posts (${since} - ${until}):`, error.response?.data || error.message);
        return 'No disponible';
      }
    };
  
    let current = startDate;
  
    while (current.isBefore(endDate) || current.isSame(endDate, 'month')) {
      const since = current.startOf('month').format('YYYY-MM-DD');
      const until = current.endOf('month').format('YYYY-MM-DD');
      const mes = current.format('YYYY-MM');
  
      const [fans, nuevos, impresiones, alcance, publicaciones] = await Promise.all([
        getMonthlyMetric('page_fans', since, until),
        getMonthlyMetric('page_fan_adds_unique', since, until),
        getMonthlyMetric('page_impressions', since, until),
        getMonthlyMetric('page_total_reach', since, until),
        getMonthlyPosts(since, until),
      ]);
  
      monthlyData.push({
        cliente,
        mes,
        seguidores_totales: fans,
        nuevos_seguidores: nuevos,
        publicaciones,
        likes_pagina: nuevos,
        impresiones_totales: impresiones,
        alcance_total: alcance,
        ...(rangoAjustado && { rango_ajustado: true }),
      });
  
      current = current.add(1, 'month');
    }
  
    return monthlyData;
  }




}