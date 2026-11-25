"""Tests for .github/workflows/deploy.yml — run: python scripts/deploy-workflow.test.py"""
import pathlib
import unittest

import yaml

ROOT = pathlib.Path(__file__).resolve().parent.parent
WF = ROOT / '.github' / 'workflows' / 'deploy.yml'


def load_workflow():
    with WF.open(encoding='utf-8') as handle:
        return yaml.safe_load(handle)


class DeployWorkflowTest(unittest.TestCase):
    def test_triggers_and_guards(self):
        data = load_workflow()
        # PyYAML 1.1 parses the top-level `on` key as boolean True.
        triggers = data.get(True, data.get('on'))
        self.assertEqual(triggers['push']['branches'], ['main'])
        self.assertEqual(
            triggers['workflow_dispatch']['inputs']['ref']['default'], 'main'
        )
        self.assertEqual(
            data['concurrency'],
            {'group': 'deploy-production', 'cancel-in-progress': False},
        )
        self.assertEqual(data['permissions'], {'contents': 'read'})

    def test_verify_job(self):
        data = load_workflow()
        commands = [
            step.get('run') for step in data['jobs']['verify']['steps']
        ]
        for command in (
            'pnpm install --frozen-lockfile',
            'pnpm --filter mglaroute-vpn-server-backend test',
            'pnpm --filter mglaroute-vpn-server-backend test:xray',
            'pnpm --filter mglaroute-vpn-server-frontend build',
            'pnpm --filter mglaroute-vpn-server-frontend lint',
        ):
            self.assertIn(command, commands)

    def test_deploy_docs(self):
        text = (ROOT / 'DEPLOY.md').read_text(encoding='utf-8')
        self.assertIn('## CI/CD', text)
        for token in (
            'SSH_HOST', 'SSH_USER', 'SSH_PRIVATE_KEY', 'PROD_ENV',
            'GIT_REMOTE', 'DEPLOY_PATH', 'DRY_RUN',
        ):
            self.assertIn(token, text)

    def test_deploy_docs_xray_pin_scope(self):
        text = (ROOT / 'DEPLOY.md').read_text(encoding='utf-8')
        self.assertIn('`v26.11.9`', text)
        self.assertIn('production upgrade requires editing the constant', text)
        self.assertNotIn('Override a build with', text)

    def test_preflight_before_env_write(self):
        steps = load_workflow()['jobs']['deploy']['steps']
        runs = [(step.get('name') or '', step.get('run') or '') for step in steps]
        pre = next(i for i, (name, _) in enumerate(runs)
                   if 'Проверить параметры' in name)
        write = next(i for i, (name, _) in enumerate(runs)
                     if '.env' in name)
        self.assertLess(pre, write)
        self.assertIn('GIT_REMOTE', runs[pre][1])
        self.assertIn('validate_env', runs[pre][1])

    def test_remote_argv_contract(self):
        steps = load_workflow()['jobs']['deploy']['steps']
        env_write = next(step for step in steps
                         if '.env' in (step.get('name') or ''))
        remote = next(step for step in steps
                      if '< scripts/deploy-remote.sh' in (step.get('run') or ''))
        self.assertIn('umask 077', env_write['run'])
        self.assertIn('printf %q', remote['run'])
        self.assertIn('bash -s -- $ref', remote['run'])
        preflight = next(step for step in steps
                         if 'Проверить каталог' in (step.get('name') or ''))
        self.assertIn("DEPLOY_PATH=%q bash -s", preflight['run'])

    def test_deploy_job(self):
        data = load_workflow()
        deploy = data['jobs']['deploy']
        self.assertEqual(deploy['needs'], 'verify')
        self.assertEqual(deploy['environment'], 'production')
        self.assertEqual(deploy['timeout-minutes'], 60)
        env = deploy['env']
        for name in ('SSH_HOST', 'SSH_USER', 'SSH_PRIVATE_KEY', 'PROD_ENV'):
            self.assertIn('secrets.' + name, env[name])
        self.assertEqual(
            env['DEPLOY_PATH'],
            "${{ vars.DEPLOY_PATH || '/home/mglaroute-vpn-provider' }}",
        )
        self.assertEqual(env['GIT_REMOTE'], '${{ vars.GIT_REMOTE }}')
        self.assertEqual(env['COMPOSE_FILE'], 'docker-compose.prod.yml')
        self.assertTrue(
            any(
                '< scripts/deploy-remote.sh' in (step.get('run') or '')
                for step in deploy['steps']
            )
        )


if __name__ == '__main__':
    unittest.main()
