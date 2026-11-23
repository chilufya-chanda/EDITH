import { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('edith_token');
    const cachedUser = localStorage.getItem('edith_user');
    if (token && cachedUser) {
      try {
        setUser(JSON.parse(cachedUser));
      } catch {
        localStorage.removeItem('edith_user');
      }
    }
    setReady(true);
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await api.login(username, password);
    const loggedInUser = { username, role: result.role, display_name: result.display_name };
    localStorage.setItem('edith_token', result.access_token);
    localStorage.setItem('edith_user', JSON.stringify(loggedInUser));
    setUser(loggedInUser);
    return loggedInUser;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('edith_token');
    localStorage.removeItem('edith_user');
    setUser(null);
  }, []);

  return { user, ready, login, logout };
}
