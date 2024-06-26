import { createAuthRule } from '../generators';
import { hasAuthDirectives, addAuthRuleToNode } from '.';

const defaultAuthModeMap: Map<string, string> = new Map<string, string>([
  ['apiKey', 'public'],
  ['iam', 'private'],
  ['userPools', 'private'],
  ['oidc', 'private'],
]);

export function migrateDefaultAuthMode(node: any, defaultAuthMode: any) {
  if (defaultAuthMode === 'iam') {
    return;
  }

  if (!hasAuthDirectives(node)) {
    const authRule = createAuthRule(defaultAuthModeMap.get(defaultAuthMode), defaultAuthMode);
    addAuthRuleToNode(node, authRule);
  }
}
