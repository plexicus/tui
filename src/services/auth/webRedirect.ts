import { randomUUID } from 'node:crypto'

export interface WebRedirectResult {
  token: string
  email: string
}

export interface WebRedirectOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const PORT_MIN = 9100
const PORT_MAX = 9199

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Wordmark from scm.plexicus.ai, inlined so the page is fully self-contained
const LOGO_DATA_URI = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMzIwIDgwIiB3aWR0aD0iMzIwIiBoZWlnaHQ9IjgwIj48aW1hZ2UgeGxpbms6aHJlZj0iZGF0YTppbWFnZS9wbmc7YmFzZTY0LGlWQk9SdzBLR2dvQUFBQU5TVWhFVWdBQUF5d0FBQUJvQ0FZQUFBQVRyM1I2QUFBQUNYQklXWE1BQUN4TEFBQXNTd0dsUFphcEFBQUFBWE5TUjBJQXJzNGM2UUFBQUFSblFVMUJBQUN4and2OFlRVUFBQUFPZEVWWWRGTnZablIzWVhKbEFFWnBaMjFobnJHV1l3QUFIQ0JKUkVGVWVBSHQzVnR5RThtMkJ1QmxYWWlPZm1udEVWQ01BRE1DNUJGZ3Yva1dnVHdDN0FHY2c0Z3pBUEFJRU5HKzhJWjZCSWdSWUVaQU1ZSnRBanZDWVdSeC9pV25hTit0UzY2cXJLei9pMURMWnJPRlhWbVZtU3N2SytjRTF0ZlhtNzkrL1hxSkx4T2h1eHpxQzlmcWNHNXVMc1hYMy9CK1VLdlZEanFkenFIa3FOVnF6Zi84K2ZPMXpGYUdhYjFlMzhEdmtnb1ZCc3ErY1hwNm1sU3IxZm5CWU5EQUh6M0VTOThUOTFjU0tSZDlScmYzOXZZNk1nVmN6d1RQMGx2eGU5MVMvRXp2cHYyWmlranZTMXhIYlZjV3haL3U3dTd1bGt5b25meEs1a1EraXA4eVBmZ2xzdFZPNTNvU3VJdDFBKzYvQksrL3BOeDF3MGdQYmQzV0xPMjJwMzRUMjl3NzRCcS93RFhlbE5sb1diL0s4eHJyYzNoMmRyYUk5dm14bkQ5LzgrNWRKVUpYSGFEY3UyZ3ZYMTM4dzdtVmxaWEZTcVh5UVdoV0IzajFFTUQ4czdPejA1TU11WTdCWi9GejQ2Zm9FRHdTQ3BacktMVUQ4aFQzbTFaOGlkQTF1RFlMMHp5THVMNXQxeEh4RHAvYnZsb0p4OGdGZmI0Q2hFdlE4RDk2Ly81OU9zbi81LytTWDgzQmVjRGlCWUtmamY5TjV6b1NHTllONDhNMWVvVm5zUzFUMFB1NzMrOS94bWMwWkhZOXRMa0xRcGU0ZTluWE01djVOWGFEQlMvd0hEYnhiVk5vWXJoMlMyakR1NlB2YXhoNTBRaFdhR2JhT0doRHNibTJ0cWFqcWE4ZVBIalF5eUtxUjhYcHMyRktWbGRYNTFHUkh3Z0Z3MVhlei9BQXQwYU5KTDRXdWgxR3MzUmt2eWNUMGhsVU1ZSXlhMk9RNlB2Ky92NGJpWlFiUURFSlZ0UWZmL3lSNjJ4MmFGemQ4QnozMWlMcmh2SGhHajNEVzF1bW9HMnVwMkJGTmZXWnlYdVZSb0NhNHMrOFpHUTBRNDlYazgvaGJMVFBnN2QvQXhZZGpSSHlMY0dOcWpkc2lzNS94M3BFRmY5VzRqUG94SXlicjRxWVpqQWFvVUY1Ykk0YVJ3NHVqQS9QeFY4eWhYcTkzbkZMbVV5ZUE1VG5TOVFMdlZnSEJkQ1o4NzJjN2plVWFaY2RPOVlObmt6OWZPTStiUGk4M2ljbkovcXpNR0M1UUpjd2lqK1o5R2xRcjc5RTI5RVdNbEdSakFxeXBEUndhV1BHNWF0RzNVSTBKcTM0MFBIN3F2ZVB4NUU4R29OMmlISE5KOTRuTVlFR3l2VkRqSFVDNnJyWHVIWSs5NnhjbE9LWnNDeVhRbURkUUJRV3JjdFI5MzNXWjFMSVRFVW9DenBGK0hWbFpXWFd6V01VT1UyZW9BRXVPeVA1MHMzeEtBUExtVkd0RXpSb2lhYU0xOWZYZFZiS3FvNUx6ODdPRmliZHV4SVRYZnJGdW9Fb0xCZjI2M0cxa2pFR0xCbkM5UDFySFIwVG9odG9SaFNQeVJOb1JqczdPMjEwRHJmRnppaXpYK0c1YkQ1dE1ZTFBYaXA1c1BMQ2JVQk9oSWlDWUpsY2hLNWp3Skl4dCttV015MTBpVnRLRSsxRzdLSkMwS0xQcXVWZWsxYlJCekYwVnREeTNzVm5iNVE1Q1FqcWhyZXNHNGpDMCsvM1p6MUtnaWJBZ0NVSE90T2kwL3RDSk9jZEVyRmJTa016cXRmcm1nNHpGU002aUlINndHcmZoeWszd21pV0Z0K2xudTFJU2JtNm9TVkVGQlEzNjFuSWVydW9HTERrQkRmNjI1aldyOU4wZEdaRjJDRUptbTdDMS8wVFlwakZ4OVVIaVJTSTlYSUlkL2huVzBxS2RRTlJtTFR1ODNDZ0pVMklBVXQrRXBjNmxVcktlSk15ZWFUN0ovUVFLN0V6UEx1a0tJTVk3cXdWblZsSnhJQ21MMGF3VXRwbmczVURVYmhjM3kwUnloUURsbnh0TXQxeE9ia1JtclpRWWV6czdQVHdacGxXMTNSNWxVL3VyQldyckRqcDBkSFJocFFVNndhaWNMaytXMHNvY3d4WWNzWlpsbkp5UzJtb1lIWjNkOThZcHp0dXVxVkF3ZExSZjh1elZuVDVYYmZiTGUwaGVxd2JpTUxGUGx0K0dMRGtyOFc5TE9XaW0vV0UwOG1GcGVtTzhmWk83R3lHbWtuUUJTdHRNWUJBOEpCbnJheHpxUWxSMkpwQ3VXREFFb0RUMDFPdVZTNEpidGFMUTcxZU4wMTNIR0ltUVFSUmk1WkxsUkNzYkpRNVdIRjFRMHVJS0VpdVRrNkVjc0dBSlFBWVdYd3VWQXFZVHRhbE5JbFFvYm5NWWJvSlB4VWpJV1VPMDdOV3F0WHFXekdpNll2MzkvZTdVbUw5ZmwvYmdVU0lLRlJNWTV3akJpeGhTSGd1UzJtOEVJcUN6Z2JvQ2V4aWwrNTR1QWsvN3lXam83Tlc4THVhL0J6dXJKVzJsQnhuVjRpQzkxZ29Od3hZQW9IR3lpcmpEZ1ZpZFhXMUpSeEJ6UXllcWU5aVRFOWd4NzlqbVRsc0hzRkNicHZ3cmM5YWNlbUwyMUp5ckJ1SXdzZCtXcjRZc0lUam1WRFVLcFVLeXpoYlpudE1MdEtUMkkwemg3WFFvYzBsTTQzbFdTdVNZZnJpTTgrellIT2VQNDkxUXk1S200bU9Kb2M2V0lNVkprakswTlZCeDVwUUtCaTVSOHdkdE1mMXI5bEpCNE5CVHpLaW1jUFcxOWNicUdCTmx2d2hJR3F2cmEybHU3dTdsdG5KTG5IcGxjM09Xc2t5ZlhFN25UdG9KNytlaUo4T3grSC80UFBFRTlZTnVjbGtRSVBpZ0VFRnJkK0ZNcU50K0p1TGYrQTFZTkcwbExvZUdlOUZyd2dhK0IzMDVrenc5V00zRFppSXJjYnk4bkpTNWl3NU1ldjMrMDNKa0Q2TGVOTTlGcnBrNlRzcVczMDJEL1ZkU3VESGp4L2RyTS95UU5DeWlhQkY2NHVtMkhpRFViNHZ1Z3hOakxuMHhTYlo3UFRleFBPUWVmcmlkaHBtdTVSMTNVRERlN0NIMlQzTHBad1VHZHd6aVZYQTR0cHJyWjgrNGV0VTZNWTIzR3ZBZ3NMczZzRnFFaUhkRk84MlJacGw5S3JYNjAyOGRZUmkxQlJqMmdqajlRNmp0VDBHdnZtbzFXcEx1UDZmeFdhQVF3ZFNkQlArUXFmVFNjV0luaE5rZk5MNkV1L1BmK0ZhWjdZY1RBY1RNV3I1cVZxdDZrQ0dCbzdESUk3bFFYUTNONEJ0OGJuYng4Zkg3VElmbGpzdTN6TXMzeVJTR0QzdDRhMjN0cmFtRmJ6SkpsZzBKRndmR2ErbllrUURGWFE4U24yR1JTZzAzVEZtU2hmUUlkU2d4ZUo1MWszd21sNTRRUXk0czFZc0I1MjJYRjFLRHA3ZmVjdWxKbTcwZGhzekNtL1lLU0lLU2djejVpWXoyVEhpcHZzSjZRd1NHb0Fsc2NHVWVSSFNOZXFHMlVXMEExanEwOEZENDlJZG13UVVUdFB0TC9GS000SlpuN1VTNnd6OHRJenJodUhvTFFLVlI3ckhpc0VLVVZqT3pzNHNrN1ZFaHdITEZGRDVkeEcwYkl0bmFGeitJeFFkekg2WUJTdnNBSWJKN1RPeFhDTy9pZGtRYnlOem8vVEZobWV0YkROOThYV0dkWVBhMHRGYkJpcEVRZXB3b0hFeURGaW1WS3ZWMnVJN1ZlYmMzRU9oNkZpTW9Hb0hrTUZLMk54c3JOa0lXcVZTZWUzandGbVhwY3JzckJVNDRMS0htMW5Ocm5BMml5aHNhQnYrRVpvSUE1WXA2VnAxM2VBc2ZuRVBTNFEwdTRqNGRTM2RINFZKbCtMZ3pTd1ZNVHFtdWdrL2tSbFluN1Z5ZG5abXRZUzI4QXpxQnBWeU5vc29iR2pEVTZHSk1HQ1pUVmVJN3VkN2IxS1hVOG5GVWEvWGRYYkJLcVh1Y0haRVowbGtDbTR2VEZOc0RNOWE0YjE2SisvN0ZoRUVaWElZSnhGTjc4R0RCNm5RUkJpd3pLQldxL251aEhDR0pVNWV5eFdkUU8vN3A4aU96c2E2V1laVWJDU25wNmNUYjViWHMxYndaclpVQzdNL1RGOThQOTkxL2dHenNCR0ZUOXNGb1lud3BQc1o2QTJucDArTHYrVVVERmdpNURsLyt3RTdnY1dqWldhWjdoaWo2b3VycTZzdjkvYjJ4dG96azhGWksxdFpISEE1S1QyY0Z3Tk5pVXhwTUJnYyt2eTlEUGF3bUMwL0pDTEtFMmRZWnFRSGNRblJMZHhTSFc4ZFZIUndQZ2tWa2dZdGxzdDE4Tmx0REtEY2U3QXQ3c2w1eTdOV1F0M3dyY3ZmRURCK3hjLzNjZG9YcnZGbmZNNW44V0RhWlh4M3djL1lFeUtpQ0RGZ21SRWFpTzlDZEl1VGt4T3ZuUkowbUZLaHd0S1U2R0tiN3ZnTlpscHVIYlYzNllzL2lKRlEweGU3YStKcitkdThqK3hzdnVzR09BeHhWb3VJeUFjR0xFU0dabGwrY2hQTzZCV2ZTM2RzdFErcGdjKytNWFBZNkt3VktXSDY0a3FsNG52Z0lKRVorYTRieEM2eEF4RlI3aGl3RUJWSXY5OVBoUW9QTXkyYjZQVDJ4TVp3RnVYaWtpTjMxb3BwK3VMajQrTUZvZHhnZHV1TEVCRkZpZ0VMa1Mydkk3dmNjQjhQakxCYlpnNmJSNER5Y3ZRTkFsM05JbVoxcXZvd2ZURlBWSitZMTdvQnMwaTgva1FGWWJHSExYYk1Fa1prQ0tQb0RZeDhpaWZza0VSRXN3eTZ6R0ZXeTdRMlYxWld2dUh6LzhJOXVDZ0djSDhmRGdZRHBpK2VndWU2Z2Z2YmlBckU3V0ZqbXo0QnpyQVFGUWNydDhob1IxL1BLeEdqc3NXbysydkw5TVdZV2RuZ1J1OHdvSnhUSWFKQ3dBeTcxWXgzdEJpd0VCVUhBNVlJYVljZm5VM0x6R0VtTkgzeC92NStWNGlJSW9mNnptdjdpNW5wcHRCRUdMQVFGUWNEbGtnaGFPbk16YzJOZGVoakNEUllDVEY5Y1pucG9aWkNSQ1o4N3hGRGZmK2MrMWdtdzRDRmlDZ0FPenM3YlNuQVNlVm9hTHNNVnNMRGdJWElqdThaRm1oY1RJeEM5MlBBUWtRVWlIcTlydWVZaEx3bkpEMDZPdG9RSXFJUzZmZjdGdlh5NXVycUtvT1dNVEZMMkl3dzJ2alFaNllYb2pzMGZKeXdIVE1kWlM3eUpuQ1hPV3pKTUhQWUxKaSttSWhLU1JPa3JLMnRpVy9vUTdieHVTMjg2K3g2VHlLaGJiRytmR2FRWk1BeU82NUJwS3pNSXpqK0tIUXJWUHFDeWovRlRNVUNPditwRkpCVzhDN2Q4V2NKcEg3UjlNVVlZVnhnK21JaUtpdlVnNW9neFNLN1Y0TFAxWm1XYUdaYnRDMUdHeVl1eU5OQnhFUDgyU2U4OTNaMmRub3lCUzRKbTVIbm16Y1ZJcHBWY25wNnVpa0Zwb0VCS3ZjbENZU21MMmF3UWtRbDkwbG9HdHBQYm1wUXBvT3VDR0srNHZXMjFXb2xrM3dJQTVZWmNIa09VWmpRMlg4cUJlZEdvWEpQZDh6MHhVUkU1ek1zUWo0a2VMVisvdnc1VWVEQ2dHVTJ2aytQNXRwd0lqK2lXS3E1dTd2N0JvM2t0dVNFNll1SmlNNVZxMVVPM1BpbmdjdkgxZFhWMW4xL2tRSExETkNZUHhPL0dMQVEwU1dZYWRsRTBOS1Q3TDFqc0VKRWRFNlRvdVJVRjhjdXdYVjllMS9HTkFZc1UxcGZYMzhoL3JQNHBFSkVkRVd0VnRQOUxLbGs1K0Q0K0xqUSs0Q0lpQXprTnVNZE81Y3g3ZTF0L3pzRGxpbTQ5WFp0OFF5RjlVMklpSzdRa1QxTktTelowUFRGUzB4ZlRFUjBHUWFQZXNMVk1KWmFDRnBlMy9RL01HQ1pFSUtWZVYxdjkrdlhMNHMxOHR6UVJVUTNRa1A1WERLQWdaTXRaZ1FqSXJyT0xRdmpMSXV0elpXVmxXc3ovQXhZeG9SQXBhSHI2eENzNk5rSWlkaGcxRTVFMTZ5dnIyczZ5TFprQVAvT3hPa21pWWpLWW1kbnB5MWN3bStxVXFtOHZOb09lVDA0RWczZFg4dkx5NGxFQUJlcmdaY2U1cFBnMjJjSVZKcDZFSTZsYVEvVElhSjRhZnIwcklJVnA2R3p5R2dzbnVob29oQVIwU1hvRDI3d0lHZFQyZzdwSnZ5TjBSLzRQdWwrczFxdFJyTlJFemVqWktnblJFUVg2QWhUdjkvL0lObEwwRmpvdjV2VnZoa2lvc0xRQVdZTUpyMXlKOVNUalJhdThidlJZRDZYaEFVQ04vMFhJU0p5TkZneDNDODNqdVp0bXgrSmlNck9MUTE3SjJRRzdkL3Z2WnNNV0FKUnFWUjRJQkVSL2VabU9CTEoxNDJiSDRtSWFIaTRiMHNZdEZoYTFEM2srZ1VEbGpDazNMOUNSQ051Wm1OZUFvREJsTmU2ajBhSWlPZ2FEVnJtNXVaZUNWblF2U3d0L1lJQlN4aDZRa1FrNXhuQjhCYlVyQWFtNVQ4d2N4Z1IwYzEwZVJpQ0Z0M3psd3I1OWt6L3c0QWxBTGpKT1oxSTVGY3FCYlN5c3JLWWNVYXdjWTB5aCtXMW40YUlLR2k2VWdhekxZOVFoMnRtcTFUSWwrRnFBd1lzK2V0eE9SaVJYMmd3Q2pjSW9ETVkxV3IxcllScmxEbU1pSWh1c2JlMzE5SEF4YzI0YUZ1VUNzMUN6MEdjOTUzV21DWlV4STRWNVFPVm41NkpjU0IwbjA5b0xEcFNJS09NWVBneTlCbU1ZZVl3WE44dElTS2lXN25CYUgySm5sRllxOVYwcG1CK01Cam9PWDhQSmZ6NmZoTHpsaGt0TVpqSGdDVlA2SUIyaTlheG92eWdNampBL2NKek1TS2p5NndDeVFnMkxzMGM5bTEvZi8rTkVCSFJ2ZDYvZjUvSytVeEx0QmxoZFJZRS9WcmRmL2xjUERzN081dm5rckFjOWZ0OWpsSVNsWnc3elRlSWpHRGpZdVl3SWlLNmFHOXY3OEF3WTFyQ2dDVW5HQzEvNVNKdUlpb3A0NHhncVJoaTVqQWlJcnJLWlV6cmlVZjR2SWNNV0hLQWhuNGJrV2hiaUtpMEVLeThNTXdJbG1JS2ZjSDRiQUJtRGlNaW9wdjRibnNhREZpeWQ0QmdoU2RIRTVVWU92bTZRZEZrRDRnbVo5QmdSV2R3M1VqWHR0aGg1ckJBVkNvVkJvNUVGQVNYY09CUS9PR1NzSXk5T3o0K0RuN1RORG80aVZDSUVxSENjeG5CekRyNUNGWTJMaTQzUmNPaEF5U1cyZVdHbWNPRWNzV0FwYmhxdFZvaVJKSHh2U3lNQVV0MnRuUXpVcmZiOVJseERtR2tOaFVpQ3A3TENLYnBpeE14b0h2ajl2ZjNyMldoUVJDekpMWjdXalJ6R0dlTzg4V0FwYmhZZGxmb25nV2hRa043OUYwOFlzQmlUQ05NRk5vVEJDdUZTUUdLbnpjUkNoRWJ0WUxyOS90Nk1HUWlCdTdhRzZjekxycE1UUHhPMFYvQ3pHSDVRbHZEK3FHZ1dIYm16T285dWgzdTYxUThZc0JpUkFNVlBlVjBaMmRuUVZPOVNZR2c0OE9SRFU5d0xYMVdsQTF1Y0M0dXpRaUcrMkZSYk55N04wNkRGdFJKRzJLSW1jUHl3NEdtN0hpdTExbDJOOEExOFpucW5RRkxCQml3ZUlUT3dJRm01ZEVaRlExVTNLWWpjeGkxVGNVai9Qei9FZkxGYTBWNWNuTENnS1dBTXNnSXRqVE9YMFNkMUdYbXNERDRYc3JMZ2FaTStRNVlXSGJYc1E2aFMzalMvUlEwQzQrT3NHaUFNaGdNdmxXcjFZTWZQMzUwTGZhbjVBRy8xMk1oTDNCLzZIMGl2dFJxTlIxMVNvVUtRek9Db1JOdmxoRU1BeFlMazV6cHBKbkRFRUExVUllOUVCdWpwQUxCSnhqSmsrKzZRUXAyK0dpUnNleHM2WW5wNGxjcVZIaGVBeFkwZ0o4cWxVcGJJcU9Wazc3MGE0eHdINFlXbVB6eHh4K0g2Q0NJUjRtT2tIWTZIVTZqemtqdkd3UzA0Z3VYRGhSTDFobkJ4cVdadzliVzFwNktYVWRwbURsc2QzZDNTK2hHdnVzR1liMmRHWXV5RS9vTi9jZ0ViWjBRWGVRMVlNR0l3OWVzbGtIUnY3U0JRdWRBR3lsdlU2am9DT2xhKzQ3UVRMUXppYklSanpqN1ZSQXVXTWs4STlpNGRCa1pPbDFtUDUrY1p3NzdocCt4TUFsSHNtUXcwTlRBYkpzR29EMGhVeFpscHdrcjJIODZoN3J0bWZpVkNoVWU5N0RFdyt1b0drYVFuZ3I1NHJOc3JEWnRrMmZvME9TU0VXeGN6QnlXTHpjVDRydmViZ3FaWTltWmE0cEhHRXovSmxSNERGZ2lvZnRweEs5RmJwejF3M05xdndZN2dPRnpCeWsyeGNhOUdjSEd4Y3hodWZQYTZVVlpXdTFMb2l0OHAyeGwyWjF6N1ZzaUh2bk82a2I1WU1BU0NkOEg5RURqOVBUVVM2ZW83RkEyWDhRamZONUxvV0JwK21LOFdUMDdZMmNFR3hjemgrWEhZS0Nwc2JxNjJoTEtRaXArc2V4azJMNDlGODhNbmpNYWcrODl0d3hZNHVIOWdkUVJINDZNems0ek9ZbGZUYzZ5aEdsbFpXWFJPSDN4d2pTYjdPK2ptY053bjI2TEhkUGtBd1htZmFrS3l2RWxnOE5Nc093OFE3dW1TNTViNHRrb2FSSmxDL2V6MTNUZERGZ2k0WHQ2Mm1tNGRmZzBBNHZSSFhTSzM3SlRFaFlON3F2VnF0bnpva3UzTElLVkVjMGNKZ1lESHhjMDNWSTVjb3hHZmpVNDVIVTJ4ckx6Uyt0UHRHc212M3ZSRHUrT2hlZkRQeG13eEtMZjcxczlrRTFNVTM5ZzUzaDZHQlUzYWRoT1QwOFpUQVppbEJFTUZiVEpjNklad2JMSUlPU1dtNlZpUnpPSGNhbXBZMVEzcUJhRFExc3NPMytNTXlveVdNbUJXOTdvdFQxa3dCSUpOL0pxTXUySmthUkZWQ2FmdVF4cE9tNTB4M3ZaYUxtZ1lmdktaWHY1Yzh1ZEVqR2d3Y3FzR2NIR3hjeGgyYktxRzV4TjFnOTJXSForYU1jV0E2NmZ4UzY5T2dPV0hPanlSdkdNSjkxSEJEZElENTJiUmJHaDA3VWZVWW5xdi9IdXdZTUh2VTZua3dxTlJaY1A0TG8xeFQ4ZG1mcUtjdW5VNi9WWExKUHN1ZEZRcjFQZkkvcE03Kzd1dGlWREdyUWdvTmpRN0Y1aXhHVU9lOEw3MWJSdVVNUDZBWjNDTGdMRmQ3VmFyY2VESmYzSnF1enc5VDlvYzd1eGxOM3k4ckl1bjlXK2ltNnduN2M4SkZJUE5CZktsQ2Flc1Rqa21nRkxSTnlEYVgxT1J4T1ZkRk1QelVKSFRTdnJGQTNoRjAwYmlQZEQvVjRpTmVPU0hDMmJwdGhwb1V4MEtVRVA1YVAvVms4M0duTHRyaTFYTVp0bEJNUElvMm5LNGR0bzVqRDhicThNTTlLTk1vYzlZUWRhTkl0Z1V3enBiS3dPWmwydHQzWHZvMHY1V3FveThMaTgwcnBlSDVZZDNyVHMzaGF3N0JyNE9SdG9pM1JwMEVQdHhPSjdIZHhKSkR0c0F6T2cyd2IwNEZwdE00eUMrRU1HTEJFNU96dnJZdFFpeTdXdjgxcjVqR1oxVUNsSnpOQllwSmpGV0poeVZMaUhWeGJwaUp1dXNuaUpzdEdmZVppbHpEVnNxWlNFWnJ6U1RyY1lRb2YrUlJFemdvMUxNNGZoZDJ6Z2Q3UTZIMktVT1d4QnlrM3YweXpQNFBoZGIxdU9iSWRzeHJyOG9wNWtVNitQRks3c0x2NmMyaVpsTFBVNWFJZE8rYnhMaXBBSVhZTHJrb2l0ZEE0UHJzKzd2ck83dTV2TGlDQ2QwM1d2d29mSjB0VDNPTXJtditKNUV4cmREbzNqZ3RWR2RWMWJydXV1RFRmWlB3bGxkZ3ozcmE0dk4xbnk1cnpCTTdVbGhuVFBqQzVwRlU4d3dyM3g5OTkvZDhRVDFnMjU4TkpmWWRrRnpWdWYxRGd4QU4ydngwMzNrVUVuN1oyUXBhWk1pV1dUdWFZWXNNNElCbHNoTGVWajVqQjdyQnR5MFJRUFdIYmg4bGsydXR4SkdLemtSZy9nWnNBU21jRmdZTG9NaG1iQ3Nza1FLaml2aDFZcFhhZHJPY3FtR2NFd0l2aEdBc0xNWVpsZzNWQmNMTHN3cFQ1bjJIVXZqbEJ1MEVad2hpVTJPaktybVlXRWdxT1ZKOHVtMkRES3BtZmZKR0lBOTBZM3EvVEZrOUtnUlErdUZFTXVjMWdpSmVUcUJtNE9MaURXNjJIU2JLWkMwY0JnZk1xQUpVNnZoSUtFaDQ2VmFFRzVqR0JXV2ZqU282T2pvUGYvYVJJRGRNd3M2NVpSNXJCU2ptU2lidGdXS2lUVzYrRkJtWFNFWWpGTW5zQ0FKVUljOFFrWEhycU9sQ2hiVnl5eXlBalc3WGFEVHkycm1jTTBBNXZZR1dVT0t4M1dEY1hGc2d0T0o4OE1pK1JkVC8vRGdDVmVuR1VKRkRwOHBobVJ5QzlOWllsZ3hXeGZDVDU3cVVpTks0SVczU0J2dVh5cDZRN2pMQjNkd3lSVVNLelhnNkVEUUh5T0lqSktuc0NBSlZKdWxvV2JBUVBrbHRiMGhJTG5Nb0paanZnSGxSRnNYTXdjWmtOSDZsazNGQlByOVdCc2MzWWxLcitUSnpCZ2lWaXRWdE0xOGFsUWNOd0o1bVUvNFR0b1pjd0lOaTVtRHJQRHVxRzRXSGI1MG9DeHFIVXEzZXppckRNRGxvaDFPcDFENjh3K05KMHNzaTdSYk1xYUVXeGN6QnhtUTY4cmZtOHVMeW9nMXV1NVNsM0FTUEZJM2Y2d0lRWXNrWE5UYVd6OEFwUkIxaVdhVXRremdvMkxtY05zdUtWaHJCc0tpUFY2OW5DOUQzWEdsMHZCNG5JMStHZkFVZ0k2UmNvS05Fd3U2eExMSmlBdVdHbUxqY0prQkJzWE00ZlpZTjFRWEN5NzdHaXdNaGdNR0t4RUJtM3c5dFdEUHhtd2xJUldvTUtabGlDeGNRdUg3cGt3REZZS2x4RnNYTXdjWm9OMVEzR3g3REtSYXJCU3hNUWxkQ2RkQ25ZdDZRb0RsaExSbVJhTTdqNFNic1FQam12Y3JETXYwUjNjWGdsbUJKc1NNNGZaWU4xUVhLN3NORGxGS3VTVmJyRFgyV29HSzlFWkpYUzVoZ0ZMeWVqb2JyMWVmMks4aElPbW9HdWYzWVBLVTVNejV0SVhmOFFNaU1sZWlTSm5CQnNYTTRmWllkMVFYTHFzaFdYbmp5NEJ3OXNXcml1WGdjVW52V3N2RWdPV0V0THNZYnFFdzgyMnNCSU5pRDZvNk5pMmRGU09PZjJ6NC9aSUpHSWdob3hnNDJMbU1EdXNHNHByVkhiYTVyTHNwcU9CaWk2eE96bzZlc1RVeGZIUmR2TDQrUGpKWFVHbzE0QUZEY2wzb2NLNFdJbmkyM2R1NUlMdWxzazEwbEU1SFVGeXl3a1lWQnBhWFYxdDRXMWViRVNURVd4Y0dXVU9leXNseGJxaHVMVE4xYkpqbXp1UmRCU282Qks3bUJLVzBKQ21jZDlBMlM3ZFY3WTFPVjlibVlnZlhFdFlRQzZpYmVuWDYrdnJpeTZkNjFNeEduRXV1RXdyUzVjbG83ZTR1TGo1NTU5L0xsWXFsV2Y0dm1tMWRDa3lYOGI1UzJnTW0ySWp1b3hnNDlLT0JlcVNCdTdURjJLaktTWEh1bUZtcWVTRWJlN2QzQ3pVSjd4NlZ6TkY1UVZsbEFwNW8yV01hL29QWmxVNjQ3YVJHckRvWGdZZjJWYzBXME5QcU5CMGRCUnYrdEtSNTNrMGdnbkt0WW4zeDdpNUVpbDVoWXBya2N2ZUgvZEFkOXhyV0RaeVBpdWdaZlJZMzlsUnVVU0RoZTQ0ZnhFVnA0N3dpR2RwMmM4RnFOVnE3WDYvci9WR1Uvemo0SmpEdW1FNnVDWkJ6RTZWdWMxMU0weGEvK3J6L0FYZkgyQW01U0RFUVI0Tm5CQmM5b3pxcytpNXN0Wnluam9RbmRQL3VFMk1UWmtTQ3ZCd2tpaUppbTE1ZVRsQlp5VEJsdzNjaEExVXJzTjNpVjh3b3owM3dVaHJBeU90Q1JvNkxZdGhtYmdHcjFTbXFZOTBXWmgyRk1RRERZQisvUGpSWlgxNHpxV0tudmRWUjJqNWFqQTZTVENvQjAvKy9Qbnp2K0tKTHNjS3VTNjRpblhETlVIWDVWZGRhSFAxM2h1K0Y2bjg5Sm5Gdlhmb3Z0WVQ2ZE9UazVQREl0YVJPaU1tZGt1SW8zQlRlZnNZdkpzVElpS2l5TG1nOUlVR1R6SWxIU1VzUThZM0lxTFEvRC9SK1NDSEQ1YVZzd0FBQUFCSlJVNUVya0pnZ2c9PSIgeD0iMCIgeT0iMCIgd2lkdGg9IjMyMCIgaGVpZ2h0PSI4MCIgcHJlc2VydmVBc3BlY3RSYXRpbz0ieE1pZFlNaWQgbWVldCIvPjwvc3ZnPg=='

// Styled after scm.plexicus.ai (theme-plexicus): white navbar, #8220FF primary,
// square corners, light body
function authPage(opts: { ok: boolean; title: string; message: string }): string {
  const icon = opts.ok
    ? '<div class="badge ok">&#10003;</div>'
    : '<div class="badge err">&#10005;</div>'
  return `<!doctype html><html><head><meta charset="utf-8"><title>Plexicus</title><style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#f8f8f8;color:#1a1a1a;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
  .navbar{background:#fff;border-bottom:1px solid #E5E5E5;padding:10px 20px;
    display:flex;align-items:center}
  .navbar img{height:28px;width:auto}
  .wrap{display:flex;align-items:flex-start;justify-content:center;padding:64px 16px}
  .box{background:#fff;border:1px solid #E5E5E5;padding:40px 48px;text-align:center;
    max-width:430px;width:100%}
  .badge{width:56px;height:56px;margin:0 auto 20px;color:#fff;font-size:1.7em;
    line-height:56px;text-align:center}
  .badge.ok{background:#8220FF}
  .badge.err{background:#db2828}
  h1{margin:0 0 10px;font-size:1.35em;font-weight:600;color:#1a1a1a}
  p{margin:6px 0;color:#555;font-size:.95em;line-height:1.5}
  a,strong{color:#8220FF}
  code{background:#f4f0fb;padding:1px 5px;font-size:.9em}
  </style></head><body>
  <div class="navbar"><img src="${LOGO_DATA_URI}" alt="PLEXICUS"></div>
  <div class="wrap"><div class="box">${icon}
  <h1>${opts.title}</h1>
  <p>${opts.message}</p>
  <p>You can close this tab and return to your terminal.</p>
  </div></div></body></html>`
}

export async function loginViaWebRedirect(
  webUrl: string,
  opts: WebRedirectOptions = {},
): Promise<WebRedirectResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000
  const nonce = randomUUID()

  let resolveResult!: (v: WebRedirectResult) => void
  let rejectResult!: (e: Error) => void
  const resultPromise = new Promise<WebRedirectResult>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })

  // Bind local server BEFORE opening browser (security: server must be ready first)
  let server: ReturnType<typeof Bun.serve> | null = null
  let port = 0

  for (let p = PORT_MIN; p <= PORT_MAX; p++) {
    try {
      server = Bun.serve({
        port: p,
        hostname: '127.0.0.1',
        fetch(req) {
          const url = new URL(req.url)
          const token = url.searchParams.get('token')
          const email = url.searchParams.get('email')
          const echoState = url.searchParams.get('state')

          const htmlHeaders = { 'Content-Type': 'text/html; charset=utf-8' }

          if (!token || !email || !echoState) {
            return new Response(
              authPage({ ok: false, title: 'Authentication failed', message: 'The redirect from the web app was missing required parameters. Run <code>plexicus login</code> again.' }),
              { status: 400, headers: htmlHeaders },
            )
          }
          if (echoState !== nonce) {
            return new Response(
              authPage({ ok: false, title: 'Authentication failed', message: 'Security check failed (state mismatch). Run <code>plexicus login</code> again.' }),
              { status: 400, headers: htmlHeaders },
            )
          }

          queueMicrotask(() => resolveResult({ token, email }))
          return new Response(
            authPage({ ok: true, title: "You're authenticated", message: `Signed in as <strong>${escapeHtml(email)}</strong>.` }),
            { headers: htmlHeaders },
          )
        },
      })
      port = p
      break
    } catch {
      // EADDRINUSE — try next port
    }
  }

  if (!server) {
    throw new Error(`No free port available in range [${PORT_MIN}, ${PORT_MAX}]`)
  }

  // Open browser after server is bound
  const target = `${webUrl}/auth/cli?port=${port}&state=${encodeURIComponent(nonce)}`
  try {
    if (process.platform === 'darwin') {
      await Bun.$`open ${target}`.quiet()
    } else if (process.platform === 'linux') {
      await Bun.$`xdg-open ${target}`.quiet()
    } else {
      console.log(`Open this URL in your browser:\n  ${target}`)
    }
  } catch {
    console.log(`Open this URL in your browser:\n  ${target}`)
  }

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(
      () => reject(new Error(`Login timed out after ${Math.round(timeoutMs / 1000)}s — run \`plexicus login --headless\` if you have no browser`)),
      timeoutMs,
    )
    opts.signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new Error('Login aborted'))
    })
  })

  try {
    return await Promise.race([resultPromise, timeoutPromise])
  } finally {
    // Graceful stop first: the success promise resolves while the browser's
    // response is still in flight — stop(true) here would reset the socket
    // and the user would never see the confirmation page.
    server.stop()
    await Bun.sleep(300)
    server.stop(true)
  }
}
