import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { lintHandler } from './lint';

const validDashboard = `
version: 1
name: Sales
slug: sales
spaceSlug: shared
tiles: []
filters:
  dimensions: []
  metrics: []
  tableCalculations: []
tabs:
  - name: Overview
    order: 0
    slug: overview
    filters:
      dimensions:
        - operator: equals
          target:
            fieldId: orders_status
            tableName: orders
          values:
            - complete
      metrics: []
      tableCalculations: []
`;

const invalidDashboard = `
version: 1
slug: missing-name
spaceSlug: shared
tiles: []
filters:
  dimensions: []
tabs: []
`;

describe('lintHandler', () => {
    let tempDir: string;
    const originalExit = process.exit;

    beforeEach(async () => {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lightdash-lint-'));
        process.exit = jest.fn() as unknown as typeof process.exit;
    });

    afterEach(async () => {
        process.exit = originalExit;
        await fs.rm(tempDir, { recursive: true, force: true });
    });

    test('accepts dashboards with tab filters', async () => {
        await fs.mkdir(path.join(tempDir, 'dashboards'));
        await fs.writeFile(
            path.join(tempDir, 'dashboards', 'sales.yml'),
            validDashboard,
        );

        await lintHandler({ path: tempDir });

        expect(process.exit).not.toHaveBeenCalled();
    });

    test('fails when a required dashboard field is missing', async () => {
        await fs.mkdir(path.join(tempDir, 'dashboards'));
        await fs.writeFile(
            path.join(tempDir, 'dashboards', 'broken.yml'),
            invalidDashboard,
        );

        await lintHandler({ path: tempDir });

        expect(process.exit).toHaveBeenCalledWith(2);
    });
});
