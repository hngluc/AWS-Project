import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js';

// Load config from environment or default to null for Demo Mode
const userPoolId = import.meta.env.VITE_USER_POOL_ID || window.COGNITO_USER_POOL_ID;
const clientId = import.meta.env.VITE_CLIENT_ID || window.COGNITO_CLIENT_ID;
const region = import.meta.env.VITE_AWS_REGION || window.COGNITO_REGION || 'ap-southeast-1';

let userPool = null;
const isDemoMode = !userPoolId || !clientId;

if (!isDemoMode) {
  try {
    userPool = new CognitoUserPool({
      UserPoolId: userPoolId,
      ClientId: clientId,
    });
  } catch (err) {
    console.warn('Failed to initialize Cognito User Pool. Switching to Demo Mode.', err);
  }
}

export const authService = {
  isDemoMode() {
    return isDemoMode || !userPool;
  },

  getConfig() {
    return {
      userPoolId,
      clientId,
      region,
      isDemo: this.isDemoMode(),
    };
  },

  async signUp(email, password, name) {
    if (this.isDemoMode()) {
      // Mock Sign Up
      await new Promise((resolve) => setTimeout(resolve, 800));
      const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
      if (users.find((u) => u.email === email)) {
        throw new Error('User already exists');
      }
      users.push({ email, name, password, role: email.includes('admin') ? 'admin' : 'user' });
      localStorage.setItem('mock_users', JSON.stringify(users));
      return { userConfirmed: true, userSub: 'mock-sub-' + Math.random().toString(36).substr(2, 9) };
    }

    // Real Cognito Sign Up
    return new Promise((resolve, reject) => {
      const attributeList = [
        new CognitoUserAttribute({ Name: 'name', Value: name }),
        new CognitoUserAttribute({ Name: 'email', Value: email }),
      ];

      userPool.signUp(email, password, attributeList, null, (err, result) => {
        if (err) return reject(err);
        resolve({
          userConfirmed: result.userConfirmed,
          userSub: result.userSub,
        });
      });
    });
  },

  async login(email, password) {
    if (this.isDemoMode()) {
      // Mock Login
      await new Promise((resolve) => setTimeout(resolve, 800));
      const users = JSON.parse(localStorage.getItem('mock_users') || '[]');
      
      // Seed default accounts if empty
      if (users.length === 0) {
        users.push({ email: 'user@example.com', name: 'Standard User', password: 'Password123!', role: 'user' });
        users.push({ email: 'admin@example.com', name: 'Admin User', password: 'Password123!', role: 'admin' });
        localStorage.setItem('mock_users', JSON.stringify(users));
      }

      const user = users.find((u) => u.email === email && u.password === password);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      const tokenData = {
        accessToken: 'mock-access-token-' + Math.random().toString(36).substr(2, 9),
        idToken: 'mock-id-token-' + Math.random().toString(36).substr(2, 9),
        refreshToken: 'mock-refresh-token-' + Math.random().toString(36).substr(2, 9),
        email: user.email,
        name: user.name,
        role: user.role,
        userId: 'mock-sub-' + email.replace(/[^a-zA-Z0-9]/g, ''),
      };

      localStorage.setItem('mock_session', JSON.stringify(tokenData));
      return tokenData;
    }

    // Real Cognito Login
    return new Promise((resolve, reject) => {
      const authenticationData = { Username: email, Password: password };
      const authenticationDetails = new AuthenticationDetails(authenticationData);
      
      const userData = { Username: email, Pool: userPool };
      const cognitoUser = new CognitoUser(userData);

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const idToken = result.getIdToken().getJwtToken();
          const accessToken = result.getAccessToken().getJwtToken();
          const refreshToken = result.getRefreshToken().getToken();
          const payload = result.getIdToken().decodePayload();

          const tokenData = {
            accessToken,
            idToken,
            refreshToken,
            email: payload.email,
            name: payload.name || email.split('@')[0],
            role: payload['cognito:groups']?.includes('admin') ? 'admin' : 'user',
            userId: payload.sub,
          };
          resolve(tokenData);
        },
        onFailure: (err) => {
          reject(err);
        },
      });
    });
  },

  logout() {
    if (this.isDemoMode()) {
      localStorage.removeItem('mock_session');
      return;
    }

    const cognitoUser = userPool.getCurrentUser();
    if (cognitoUser) {
      cognitoUser.signOut();
    }
  },

  async getCurrentUser() {
    if (this.isDemoMode()) {
      const session = localStorage.getItem('mock_session');
      return session ? JSON.parse(session) : null;
    }

    return new Promise((resolve) => {
      const cognitoUser = userPool.getCurrentUser();
      if (!cognitoUser) return resolve(null);

      cognitoUser.getSession((err, session) => {
        if (err || !session.isValid()) return resolve(null);

        cognitoUser.getUserAttributes((err, attributes) => {
          if (err) return resolve(null);
          
          const emailAttr = attributes.find(a => a.getName() === 'email');
          const nameAttr = attributes.find(a => a.getName() === 'name');
          const payload = session.getIdToken().decodePayload();

          resolve({
            accessToken: session.getAccessToken().getJwtToken(),
            idToken: session.getIdToken().getJwtToken(),
            refreshToken: session.getRefreshToken().getToken(),
            email: emailAttr?.getValue() || payload.email,
            name: nameAttr?.getValue() || payload.name || payload.email?.split('@')[0],
            role: payload['cognito:groups']?.includes('admin') ? 'admin' : 'user',
            userId: payload.sub,
          });
        });
      });
    });
  },
};
