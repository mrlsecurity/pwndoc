module.exports = function(request, app) {
  describe('Findings Export Suite Tests', () => {
    var userToken = '';
    var auditId = '';

    beforeAll(async () => {
      var response = await request(app).post('/api/users/token').send({username: 'admin', password: 'Admin123'})
      userToken = response.body.datas.token

      // Create audit
      response = await request(app).post('/api/audits')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({name: 'Export Test Audit', language: 'en', auditType: 'Web'})
      expect(response.status).toBe(201)
      auditId = response.body.datas.audit._id

      // Create findings
      response = await request(app).post(`/api/audits/${auditId}/findings`)
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          title: 'SQL Injection',
          vulnType: 'Web Application',
          category: 'Injection',
          cvssv3: 'AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H',
          description: '<p>SQL injection vulnerability</p>',
          observation: '<p>Observed during testing</p>',
          remediation: '<p>Use parameterized queries</p>',
          remediationComplexity: 1,
          priority: 2,
          references: ['https://owasp.org/sqli', 'https://cwe.mitre.org/89'],
          scope: 'app.example.com',
          poc: '<p>Proof of concept here</p>'
        })
      expect(response.status).toBe(200)

      response = await request(app).post(`/api/audits/${auditId}/findings`)
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          title: 'XSS Stored',
          vulnType: 'Web Application',
          category: 'Cross-Site Scripting',
          cvssv3: 'AV:N/AC:L/PR:L/UI:R/S:C/C:L/I:L/A:N',
          description: '<p>Stored XSS in comments</p>',
          remediation: '<p>Encode output</p>',
          references: ['https://owasp.org/xss']
        })
      expect(response.status).toBe(200)

      // Ensure export is enabled in settings
      response = await request(app).put('/api/settings')
        .set('Cookie', [`token=JWT ${userToken}`])
        .send({
          export: {
            enabled: true,
            public: {
              excludedFields: {
                poc: false,
                observation: false,
                references: false,
                scope: false,
                remediation: false,
                remediationComplexity: false,
                priority: false,
                retestStatus: false,
                retestDescription: false
              }
            }
          }
        })
    })

    describe('Export endpoint validation', () => {
      it('Should reject export with missing format parameter', async () => {
        var response = await request(app).get(`/api/audits/${auditId}/export`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(422)
      })

      it('Should reject export with invalid format parameter', async () => {
        var response = await request(app).get(`/api/audits/${auditId}/export?format=xml`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(422)
      })

      it('Should reject export for non-existent audit', async () => {
        var response = await request(app).get(`/api/audits/deadbeefdeadbeefdeadbeef/export?format=csv`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).not.toBe(200)
      })
    })

    describe('CSV export', () => {
      it('Should export findings as CSV', async () => {
        var response = await request(app).get(`/api/audits/${auditId}/export?format=csv`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        expect(response.headers['content-disposition']).toContain('.csv')

        var csv = response.text
        var lines = csv.split('\n')
        expect(lines.length).toBeGreaterThanOrEqual(3) // header + 2 findings

        var headers = lines[0].split(',')
        expect(headers).toContain('title')
        expect(headers).toContain('severity')
        expect(headers).toContain('cvssv3')
        expect(headers).toContain('description')

        // Check that HTML is stripped
        expect(csv).not.toContain('<p>')
        expect(csv).not.toContain('</p>')

        // Check finding data is present
        expect(csv).toContain('SQL Injection')
        expect(csv).toContain('XSS Stored')
      })
    })

    describe('DefectDojo JSON export', () => {
      it('Should export findings as DefectDojo JSON', async () => {
        var response = await request(app).get(`/api/audits/${auditId}/export?format=json-defectdojo`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        expect(response.headers['content-disposition']).toContain('defectdojo.json')

        var data = JSON.parse(response.text)
        expect(data).toHaveProperty('findings')
        expect(data.findings).toHaveLength(2)

        var finding = data.findings.find(f => f.title === 'SQL Injection')
        expect(finding).toBeDefined()
        expect(finding.severity).toBe('Critical')
        expect(finding.description).not.toContain('<p>')
        expect(finding).toHaveProperty('mitigation')
        expect(finding).toHaveProperty('cvssv3')
      })
    })

    describe('PwnDoc JSON export', () => {
      it('Should export findings as PwnDoc JSON', async () => {
        var response = await request(app).get(`/api/audits/${auditId}/export?format=json-pwndoc`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        expect(response.headers['content-disposition']).toContain('.json')

        var data = JSON.parse(response.text)
        expect(data).toHaveProperty('audit')
        expect(data).toHaveProperty('findings')
        expect(data.audit.name).toBe('Export Test Audit')
        expect(data.findings).toHaveLength(2)

        var finding = data.findings.find(f => f.title === 'SQL Injection')
        expect(finding).toBeDefined()
        expect(finding.severity).toBe('Critical')
        expect(finding.cvssScore).toBeGreaterThanOrEqual(9)
        expect(finding.description).not.toContain('<p>')
        expect(finding).toHaveProperty('poc')
        expect(finding).toHaveProperty('scope')
        expect(finding).toHaveProperty('references')
      })
    })

    describe('Field exclusion', () => {
      it('Should exclude poc field when configured', async () => {
        // Update settings to exclude poc
        await request(app).put('/api/settings')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({
            export: {
              enabled: true,
              public: {
                excludedFields: {
                  poc: true,
                  observation: false,
                  references: false,
                  scope: false,
                  remediation: false,
                  remediationComplexity: false,
                  priority: false,
                  retestStatus: false,
                  retestDescription: false
                }
              }
            }
          })

        // CSV should not have poc column
        var response = await request(app).get(`/api/audits/${auditId}/export?format=csv`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(200)
        var headers = response.text.split('\n')[0].split(',')
        expect(headers).not.toContain('poc')

        // PwnDoc JSON should not have poc field
        response = await request(app).get(`/api/audits/${auditId}/export?format=json-pwndoc`)
          .set('Cookie', [`token=JWT ${userToken}`])
        var data = JSON.parse(response.text)
        expect(data.findings[0]).not.toHaveProperty('poc')

        // Reset settings
        await request(app).put('/api/settings')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({
            export: {
              enabled: true,
              public: {
                excludedFields: {
                  poc: false,
                  observation: false,
                  references: false,
                  scope: false,
                  remediation: false,
                  remediationComplexity: false,
                  priority: false,
                  retestStatus: false,
                  retestDescription: false
                }
              }
            }
          })
      })
    })

    describe('Export disabled', () => {
      it('Should reject export when disabled in settings', async () => {
        await request(app).put('/api/settings')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({
            export: {
              enabled: false,
              public: {
                excludedFields: {
                  poc: false,
                  observation: false,
                  references: false,
                  scope: false,
                  remediation: false,
                  remediationComplexity: false,
                  priority: false,
                  retestStatus: false,
                  retestDescription: false
                }
              }
            }
          })

        var response = await request(app).get(`/api/audits/${auditId}/export?format=csv`)
          .set('Cookie', [`token=JWT ${userToken}`])
        expect(response.status).toBe(403)

        // Re-enable
        await request(app).put('/api/settings')
          .set('Cookie', [`token=JWT ${userToken}`])
          .send({
            export: {
              enabled: true,
              public: {
                excludedFields: {
                  poc: false,
                  observation: false,
                  references: false,
                  scope: false,
                  remediation: false,
                  remediationComplexity: false,
                  priority: false,
                  retestStatus: false,
                  retestDescription: false
                }
              }
            }
          })
      })
    })

    // Cleanup
    afterAll(async () => {
      await request(app).delete(`/api/audits/${auditId}`)
        .set('Cookie', [`token=JWT ${userToken}`])
    })
  })
}
