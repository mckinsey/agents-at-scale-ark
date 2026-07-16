import { FEDERATED_SIGNOUT_PATH } from '../constants/auth';

export function signout() {
  window.location.href = FEDERATED_SIGNOUT_PATH;
}
