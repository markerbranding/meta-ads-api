import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as dayjs from 'dayjs';
import { getMetaClients } from './meta/config/meta-clients.config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as nodemailer from 'nodemailer';


@Injectable()
export class AppService {


  // Obtener data de Meta Ads:
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


  

  // Crear token de mayor duración (60 días):
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
      const defaultExpiresIn = 60 * 24 * 60 * 60; // 60 días en segundos
      const expireDate = dayjs().add(defaultExpiresIn, 'second').format('YYYY-MM-DD');

      console.log(`⚠️ expires_in no recibido, usando duración estimada de 60 días → Expira el: ${expireDate}`);

      const content = `# Generado automáticamente el ${dayjs().format('YYYY-MM-DD')}
      CLIENTE1_TOKEN=${longLivedToken}
      CLIENTE1_TOKEN_EXPIRES_AT=${expireDate}
      # Expira el ${expireDate}
      `;

      const envPath = path.resolve(__dirname, '../.env.generated');

      fs.writeFileSync(envPath, content);

      console.log('\n✅ Nuevo token guardado en .env.generated');
      console.log(`💡 Expira el: ${expireDate}\n`);

      await this.updateRenderEnvVars(longLivedToken, expireDate);

      return {
        message: 'Token generado correctamente',
        token: longLivedToken,
        expiresInDays: 60, // asumimos 60 días porque es un token de larga duración
        expiresAt: expireDate,
        savedTo: envPath,
      };
    } catch (error) {
      console.error('❌ Error al intercambiar token:', error.response?.data || error.message);
      throw new InternalServerErrorException('No se pudo obtener el token largo');
    }
  }



  // Imágenes en Meta Ads
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







  // Facebook Insights:
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
      nuevos_seguidores_brutos: number | string;
      publicaciones: number | string;
      impresiones_totales: number | string;
      impresiones_pagadas: number | string;
      alcance_total: number | string;
      alcance_pagado: number | string;
      rango_ajustado?: boolean;
    }[] = [];
  
    const getMetricLastValue = async (metric: string, since: string, until: string) => {
      try {
        const url = `https://graph.facebook.com/v19.0/${pageId}/insights/${metric}`;
        const response = await axios.get(url, {
          params: { access_token: pageToken, since, until },
        });
        const values = response.data?.data?.[0]?.values;
        if (Array.isArray(values) && values.length > 0) {
          const last = values[values.length - 1]?.value;
          return typeof last === 'number' ? last : parseInt(last) || 0;
        }
        return 'No disponible';
      } catch (error) {
        console.error(`❌ Métrica fallida '${metric}' (${since} - ${until}):`, error.response?.data || error.message);
        return 'No disponible';
      }
    };
  
    const getMetricSum = async (metric: string, since: string, until: string) => {
      try {
        const url = `https://graph.facebook.com/v19.0/${pageId}/insights/${metric}`;
        const response = await axios.get(url, {
          params: { access_token: pageToken, since, until },
        });
    
        const values = response.data?.data?.[0]?.values;
    
        if (!Array.isArray(values) || values.length === 0) return 'No disponible';
    
        const total = values.reduce((sum, v) => {
          const val = v.value;
          if (typeof val === 'number') return sum + val;
          if (typeof val === 'object') {
            const paid = parseInt(val.paid) || 0;
            const unpaid = parseInt(val.unpaid) || 0;
            return sum + paid + unpaid;
          }
          return sum;
        }, 0);
    
        return total;
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
  
      const [
        seguidores_totales,
        nuevos_seguidores,
        impresiones_totales,
        impresiones_pagadas,
        alcance_total,
        alcance_pagado,
        publicaciones,
        nuevos_seguidores_brutos
      ] = await Promise.all([
        getMetricLastValue('page_fans', since, until),
        getMetricSum('page_fan_adds_by_paid_non_paid_unique', since, until),
        getMetricSum('page_impressions', since, until),
        getMetricSum('page_impressions_paid', since, until),
        getMetricSum('page_impressions_unique', since, until),
        getMetricSum('page_impressions_paid_unique', since, until),
        getMonthlyPosts(since, until),
        getMetricSum('page_fan_adds', since, until)
      ]);
  
      monthlyData.push({
        cliente,
        mes,
        seguidores_totales,
        nuevos_seguidores,
        publicaciones,
        nuevos_seguidores_brutos,
        impresiones_totales,
        impresiones_pagadas,
        alcance_total,
        alcance_pagado,
        ...(rangoAjustado && { rango_ajustado: true }),
      });
  
      current = current.add(1, 'month');
    }
  
    return monthlyData;
  }





  // Automatización del token:
  async refreshPageToken() {
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
  
      // 1️⃣ Guardamos el token en .env.generated
      const content = `# Actualizado el ${dayjs().format('YYYY-MM-DD')}
  CLIENTE1_PAGE_TOKEN=${longLivedToken}
  CLIENTE1_TOKEN_EXPIRES_AT=${expireDate}
  # Expira el ${expireDate}
  `;
  
      const envPath = path.resolve(__dirname, '../.env.generated');
      fs.writeFileSync(envPath, content);
  
      console.log('✅ Token de página guardado en .env.generated');
  
      // 2️⃣ Subimos a variables de entorno en Render
      await this.updateRenderEnvVars(longLivedToken, expireDate);
  
      return {
        token: longLivedToken,
        expiresAt: expireDate,
      };
    } catch (error) {
      console.error('❌ Error al renovar token de página:', error.response?.data || error.message);
      throw new InternalServerErrorException('No se pudo renovar el token de página');
    }
  }


  // Agendar que se genere nuevo token cada semana:
  @Cron(CronExpression.EVERY_WEEK)
  async autoRefreshPageToken() {
    console.log('🔁 Ejecutando tarea automática de refresh de token de página');
    try {
      const result = await this.refreshPageToken();
      const msg = `✅ Token de página actualizado correctamente.\n\nCliente: cliente1\nExpira el: ${result.expiresAt}`;
      await this.sendEmail('✅ Token Meta actualizado', msg);
    } catch (error) {
      const errorMsg = `❌ Error al actualizar token de página: ${error.message}`;
      console.error(errorMsg);
      await this.sendEmail('❌ Fallo en actualización de token Meta', errorMsg);
    }
  }




  
  // Enviar correo tras actualizar el token:
  async sendEmail(subject: string, text: string) {
    const transporter = nodemailer.createTransport({
      service: 'gmail', // o 'hotmail', 'outlook', etc.
      auth: {
        user: process.env.EMAIL_USER, // tu correo
        pass: process.env.EMAIL_PASS, // tu app password o contraseña
      },
    });

    await transporter.sendMail({
      from: `"Meta Ads API" <${process.env.EMAIL_USER}>`,
      to: process.env.NOTIFY_EMAIL || process.env.EMAIL_USER,
      subject,
      text,
    });

    console.log('📩 Correo enviado:', subject);
  }






  // Subir a render.com:
  private async updateRenderEnvVars(newToken: string, newExpiresAt: string): Promise<void> {
    const apiKey = process.env.RENDER_API_KEY;
    const serviceId = process.env.RENDER_SERVICE_ID;
    const url = `https://api.render.com/v1/services/${serviceId}/env-vars`;
  
    try {
      const { data: existingVars } = await axios.get(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
  
      const varsMap: Record<string, string> = {};
  
      for (const env of existingVars) {
        if (env.key && env.value !== undefined) {
          varsMap[env.key] = env.value;
        }
      }
  
      if (!newToken || !newExpiresAt) {
        throw new Error('Token o fecha de expiración están vacíos');
      }
  
      // ⚠️ Agregamos los nuevos valores
      varsMap['CLIENTE1_PAGE_TOKEN'] = newToken;
      varsMap['CLIENTE1_TOKEN_EXPIRES_AT'] = newExpiresAt;
  
      const updatedVars = Object.entries(varsMap)
        .filter(([key, value]) => key && value) // filtra valores válidos
        .map(([key, value]) => ({ key, value }));
  
      await axios.put(url, updatedVars, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log('✅ Variables actualizadas en Render');
    } catch (error) {
      console.error('❌ Error al actualizar variables en Render:', error.response?.data || error.message);
      throw new Error('No se pudo actualizar Render');
    }
  }




}