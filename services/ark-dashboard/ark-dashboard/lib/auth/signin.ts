import { SIGNIN_PATH } from '../constants/auth';

export function redirectToSignIn() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  window.location.replace(`${basePath}${SIGNIN_PATH}`);
}
