// frontend/src/services/api.js
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:4000';

const api = axios.create({
  baseURL: API_URL,
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const signup = (email, password) =>
  api.post('/auth/signup', { email, password }).then((r) => r.data);

export const login = (email, password) =>
  api.post('/auth/login', { email, password }).then((r) => r.data);

export const getMe = () => api.get('/auth/me').then((r) => r.data);

// Social Accounts
export const getAccounts = () => api.get('/accounts').then((r) => r.data);

export const getTikTokOAuthUrl = () =>
  api.get('/accounts/tiktok/oauth-url').then((r) => r.data);

export const connectTikTokMock = () =>
  api.post('/accounts/tiktok/callback', { code: 'mock' }).then((r) => r.data);

export const disconnectAccount = (platform) =>
  api.delete(`/accounts/${platform}`).then((r) => r.data);

// Posts
export const uploadVideo = (file, onProgress) => {
  const formData = new FormData();
  formData.append('video', file);
  return api
    .post('/posts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    })
    .then((r) => r.data);
};

export const createPost = (data) => api.post('/posts', data).then((r) => r.data);

export const getPosts = () => api.get('/posts').then((r) => r.data);

export const getPost = (id) => api.get(`/posts/${id}`).then((r) => r.data);

export const deletePost = (id) => api.delete(`/posts/${id}`).then((r) => r.data);

export const retryPost = (postId, targetId) =>
  api.post(`/posts/${postId}/retry/${targetId}`).then((r) => r.data);

export default api;
