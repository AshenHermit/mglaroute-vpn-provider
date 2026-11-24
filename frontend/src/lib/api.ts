import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth.store';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface EnvelopeResponse<T> {
  ok: boolean;
  code?: string;
  message?: string;
  data?: T;
}

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      const token = useAuthStore.getState().token;
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => {
        const envelope = response.data as EnvelopeResponse<unknown>;
        if (envelope && typeof envelope === 'object' && 'ok' in envelope) {
          if (!envelope.ok) {
            const error = new Error(envelope.message || 'Request failed') as AxiosError & { code?: string };
            error.code = envelope.code;
            error.response = response;
            return Promise.reject(error);
          }
          return envelope.data;
        }
        return response.data;
      },
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          useAuthStore.getState().clearAuth();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  get<T>(url: string, params?: Record<string, unknown>): Promise<T> {
    return this.client.get<T>(url, { params }) as unknown as Promise<T>;
  }

  post<T>(url: string, data?: unknown): Promise<T> {
    return this.client.post<T>(url, data) as unknown as Promise<T>;
  }

  put<T>(url: string, data?: unknown): Promise<T> {
    return this.client.put<T>(url, data) as unknown as Promise<T>;
  }

  delete<T>(url: string): Promise<T> {
    return this.client.delete<T>(url) as unknown as Promise<T>;
  }
}

export const api = new ApiClient();

/** Backend envelope `message` can be a string, string[] or nested validation object. */
export function getErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const error = err as { message?: unknown; response?: { data?: { message?: unknown } } };
  const message = error.message ?? error.response?.data?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map((item) => String(item)).join('; ');
  return fallback;
}