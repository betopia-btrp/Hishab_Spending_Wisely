/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import axios from 'axios';

/**
 * Backend API Configuration
 * 
 * CHANGE THIS URL IN .env.example:
 * NEXT_PUBLIC_API_URL="http://expense-management-api.test/api"
 */
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://expense-management-api.test/api';

const axiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  withCredentials: true,
});

axiosInstance.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;
