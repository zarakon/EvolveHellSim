onmessage = function(e) {
    
    switch (e.data.cmd) {
        case 'start':
            SimStart(e.data.id, e.data.count);
            break;
        case 'stop':
            break;
        default:
            break;
    }
    
    return;
}

function SimStart(id, count) {
    var i = 1;
    var progress = 0;
    while (i < count) {
        i++;
        Math.random();
        let newProgress = Math.floor(100 * i / count);
        if (newProgress > progress) {
            let increment = newProgress - progress;
            if (increment >= 10 || newProgress == 100) {
                self.postMessage({id: id, cmd: 'progress', progress: (increment)});
                progress = newProgress;
            }
        }
    }
    self.postMessage({id: id, cmd: 'done', count: i});
}

function SimStop() {
    
}

function BloodWar(params, sim, stats) {
    stats.bloodWars++;
    stats.totalPreFightThreat += sim.threat;
    if (sim.threat < stats.minPreFightThreat) {
        stats.minPreFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPreFightThreat) {
        stats.maxPreFightThreat = sim.threat;
    }
    let preFightThreat = sim.threat;
    
    stats.totalWounded += sim.wounded;
    if (sim.wounded > stats.maxWounded) {
        stats.maxWounded = sim.wounded;
    }
    
    stats.totalPity += sim.pity;
    stats.maxPity = Math.max(stats.maxPity, sim.pity);
    
    LogVerbose(sim, params,
        "T " + sim.tick + 
        " ; soldiers " + sim.soldiers +
        " ; hellSoldiers " + sim.hellSoldiers +
        " ; threat " + sim.threat);

    /* Check whether enough soldiers are currently available to keep the soul forge running */
    let forgeOperating = false;
    if (params.soulForge >= 1) {
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let forgeSoldiers = ForgeSoldiers(params);
        if (defenders >= forgeSoldiers) {
            forgeOperating = true;
            stats.forgeOn++;
        }
    }
    let forgeSouls = 0;

    /* Drone Strikes */
    for (let i = 0; i < params.predators; i++) {
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            let kills = params.advDrones ? Rand(50, 125) : Rand(25, 75);
            if (kills < demons) {
                sim.threat -= kills;
                if (forgeOperating) {
                    forgeSouls += kills;
                }
                stats.kills += kills;
            } else {
                sim.threat -= demons;
                if (forgeOperating) {
                    forgeSouls += demons;
                }
                stats.kills += demons;
            }
        }
    }
    
    /* Gem Chance */
    let gemOdds = params.technophobe ? 9000 : 10000;
    gemOdds -= sim.pity;
    if (params.darkEnergy >= 1) {
        gemOdds -= Math.round(Math.log2(params.darkEnergy) * 2);
    }
    for (let i = 0; i < params.beacons; i++) {
        gemOdds = Math.round(gemOdds * 0.92);
    }
    if (params.ghostly) {
        gemOdds = Math.round(gemOdds * 0.85);
    }
    
    /* Patrols */
    let soldiersKilled = 0;
    let needPity = false;
    /* Update patrol rating if cautious, for random weather */
    if (params.cautious) {
        sim.patrolRating = ArmyRating(params, sim, params.patrolSize);
        if (params.enhDroids) {
            sim.patrolRatingDroids = ArmyRating(params, sim, params.patrolSize + 2);
        } else {
            sim.patrolRatingDroids = ArmyRating(params, sim, params.patrolSize + 1);
        }
    }
    let patrolWounds = 0;
    let extraWounds = 0;
    if (sim.wounded > 0) {
        /* Figure out how many wounds to assign to patrols */
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let garrison = sim.soldiers - sim.hellSoldiers;
        let patrolWoundTotal = sim.wounded - garrison - defenders;
        if (patrolWoundTotal > 0) {
            patrolWounds = Math.floor(patrolWoundTotal / sim.patrols);
            extraWounds = patrolWoundTotal % sim.patrols;
        }
    }
    for (let i = 0; i < sim.patrols; i++) {
        /* Check for encounter
           Less demons -> lower chance of encounter
         */
        let wounded = patrolWounds;
        if (i < extraWounds) {
            wounded++;
        }
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            /* Encounter */
            stats.patrolEncounters++;
            
            var patrolRating;
            /* If no wounded, use alread-calculated patrol rating to save time */
            if (wounded == 0) {
                if (i < params.droids) {
                    patrolRating = sim.patrolRatingDroids;
                } else {
                    patrolRating = sim.patrolRating;
                }
            } else {
                let patrolSize = params.patrolSize;
                if (i < params.droids) {
                    patrolSize += params.enhDroids ? 2 : 1;
                }
                patrolRating = ArmyRating(params, sim, patrolSize, wounded);
            }
            
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            
            let ambushOdds = (params.chameleon || params.elusive) ? 50 : 30;
            if (Rand(0, ambushOdds) == 0) {
                /* Ambush 
                   Patrol armor is ignored, at least one will be killed/injured, and no chance for a soul gem
                 */
                stats.ambushes++;

                soldiersKilled += PatrolCasualties(params, sim, stats, demons, true);
                let demonsKilled = Math.round(patrolRating / 2);
                if (demonsKilled < demons) {
                    sim.threat -= demonsKilled;
                    if (forgeOperating) {
                        forgeSouls += demonsKilled;
                    }
                    stats.kills += demonsKilled;
                } else {
                    sim.threat -= demons;
                    if (forgeOperating) {
                        forgeSouls += demons;
                    }
                    stats.kills += demons;
                }
            } else {
                /* Normal encounter */
                let demonsKilled = patrolRating;
                if (demonsKilled < demons) {
                    /* Suffer casualties if the patrol didn't kill all of the demons */
                    soldiersKilled += PatrolCasualties(params, sim, stats, (demons - demonsKilled), false);
                    sim.threat -= demonsKilled;
                    if (forgeOperating) {
                        forgeSouls += demonsKilled;
                    }
                    stats.kills += demonsKilled;
                } else {
                    sim.threat -= demons;
                    if (forgeOperating) {
                        forgeSouls += demons;
                    }
                    stats.kills += demons;
                }
                
                /* Chance to find a soul gem */
                if (Rand(0, gemOdds) == 0) {
                    stats.patrolGems++;
                    stats.totalPityPerGem += sim.pity;
                    sim.pity = 0;
                } else {
                    needPity = true;
                }
                
            }
        } else {
            /* Skipped encounter */
            stats.skippedEncounters++;
        }
    }
    
    if (params.revive) {
        let reviveMax = soldiersKilled / 3 + 0.25;
        let revived = Math.round(Math.random() * reviveMax);
        sim.soldiers += revived;
        stats.soldiersRevived += revived;
    }

    if (sim.wounded > sim.soldiers) {
        sim.wounded = sim.soldiers;
    }
    
    if (sim.soldiers < sim.hellSoldiers) {
        sim.hellSoldiers = sim.soldiers;
    }
    
    /* If all reserves are gone, reduce the number of patrols.  This is permanent. */
    if (sim.hellSoldiers < sim.patrols * params.patrolSize) {
        sim.patrols = Math.floor(sim.hellSoldiers / params.patrolSize);
        if (params.printLostPatrols) {
            LogResult(stats, TimeStr(sim) + " - Lost patrol. " + sim.patrols + " remaining.  Threat: " + sim.threat + "\n");
        }
        if (sim.patrols == 0) {
            LogResult(stats, "!!! Lost all patrols at " + TimeStr(sim) + " !!!\n\n");
        }
    }
    
    stats.totalPostFightThreat += sim.threat;
    if (sim.threat < stats.minPostFightThreat) {
        stats.minPostFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPostFightThreat) {
        stats.maxPostFightThreat = sim.threat;
    }

    /* Pity */
    if (needPity && sim.pity < 10000) {
        sim.pity++;
    }

    LogVerbose(sim, params,
        " ; postThreat " + sim.threat +
        " ; dead " + soldiersKilled +
        " ; pity " + sim.pity +
        " ; gemOdds " + gemOdds +
        "\n");
    
    /* Siege */
    if (params.sieges) {
        sim.siegeOdds--;
        if (sim.siegeOdds <= 900 && Rand(0, sim.siegeOdds) == 0) {
            stats.sieges++;
            let demons = Math.round(sim.threat / 2);
            let defense = FortressRating(params, sim);
     
            if (params.printSieges) {
                LogResult(stats, TimeStr(sim) + " - " +
                    "Siege -- Demons " + demons +
                    ",  Fortress rating " + defense);
            }

            defense = Math.max(1, defense / 35);

            let totalKills = 0;
            while (demons > 0 && sim.walls > 0) {
                let kills = Math.round(Rand(1, defense+1));
                totalKills += Math.min(kills, demons);
                demons -= Math.min(kills, demons);
                sim.threat -= Math.min(kills, sim.threat);
                if (demons > 0) {
                    sim.walls--;
                    if (sim.walls == 0) {
                        break;
                    }
                }
            }
            if (forgeOperating) {
                forgeSouls += totalKills;
            }
            stats.kills += totalKills;
            if (params.printSieges) {
                LogResult(stats, ",  Walls " + sim.walls + "\n");
            }
            
            if (sim.walls == 0) {
                sim.soldiers -= sim.patrols * params.patrolSize;
                sim.soldiers -= sim.hellSoldiers;
                sim.patrols = 0;
                sim.hellSoldiers = 0;
                sim.maxHellSoldiers = 0;
                LogResult(stats, "!!! Walls fell at " + TimeStr(sim) + " !!!\n\n");
            }
            
            sim.siegeOdds = 999;
        }
    }
    
    stats.totalWalls += sim.walls;
    stats.minWalls = Math.min(stats.minWalls, sim.walls);
    
    /* Demon influx */
    if (sim.threat < 10000) {
        let influx = ((10000 - sim.threat) / 2500) + 1;
        influx *= 1 + (params.beacons * 0.22);
        influx = Math.round(influx);
        sim.threat += Rand(influx * 10, influx * 50);
    }
    

    /* Surveyors */
    if (sim.surveyors > 0) {
        let divisor = 1000;
        if (params.blurry) {
            divisor += 250;
        }
        if (params.shieldGen) {
            divisor += 250;
        }
        let danger = sim.threat / divisor;
        let exposure = Math.min(10, sim.surveyors);
        let risk = 10 - Rand(0, exposure+1);
        
        if (danger > risk) {
            let cap = Math.round(danger);
            let dead = Rand(0, cap+1);
            sim.surveyors -= Math.min(dead, sim.surveyors);
        }
    }

    /* Soul Attractors */
    if (forgeOperating) {
        forgeSouls += params.soulAttractors * ((params.soulTrap * 5) + Rand(40, 120));
    }

    /* Gun Emplacements */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 6750 : 7500;
        if (params.soulLink) {
            gemOdds = Math.round(gemOdds * 0.94 ** params.soulAttractors);
        }
        let gunKills = 0;
        if (params.advGuns) {
            gunKills = params.guns * Rand(35, 75);
        } else {
            gunKills = params.guns * Rand(20, 40);
        }
        forgeSouls += gunKills;
        stats.kills += gunKills;
        for (let i = 0; i < params.guns; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gunGems++;
            }
        }
    }

    /* Gate Turrets */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 2700 : 3000;
        let gateKills = 0;
        if (params.advGuns) {
            gateKills = params.gateTurrets * Rand(65, 100);
        } else {
            gateKills = params.gateTurrets * Rand(40, 60);
        }
        forgeSouls += gateKills;
        stats.kills += gateKills;
        for (let i = 0; i < params.gateTurrets; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gateGems++;
            }
        }
    }
    
    /* Soul Forge */
    if (forgeOperating) {
        let gemOdds = params.technophobe ? 4500 : 5000;
        let forgeKills = Rand(25, 150);
        forgeSouls += forgeKills;
        stats.kills += forgeKills;
        if (Rand(0, gemOdds) == 0) {
            stats.forgeGems++;
        }
    
        stats.forgeSouls += forgeSouls;
        sim.forgeSouls += forgeSouls;
        
        let cap = params.soulAbsorption ? 750000 : 1000000;
        if (params.soulLink) {
            cap = Math.round(cap * 0.97 ** params.soulAttractors);
        }
        if (sim.forgeSouls > cap) {
            stats.forgeGems++;
            sim.forgeSouls = 0;
        }
    }
}

function Events(params, sim, stats) {    
    if (Rand(0, sim.eventOdds) == 0) {
        let events = [
            "surge",
            "terrorist",
            "ruins",
            "inspiration"
        ];
        
        if (!params.kindling) {
            events.push("fire");
        }
        
        if (!(params.kindling || params.smoldering || params.evil || params.aquatic)) {
            events.push("fire");
        }
        if (params.slaver) {
            events.push("slave1", "slave2", "slave3");
        }
        
        /* Remove the last event that occurred from the list so that the same event can't happen twice in a row */
        let lastIdx = events.indexOf(sim.lastEvent);
        if (lastIdx != -1) {
            events.splice(lastIdx, 1);
        }

        let event = events[Rand(0, events.length)];
        
        if (event == "surge") {
            /* Demon surge event, if enabled by user */
            if (params.surges) {
                let surge = Rand(2500, 5000);
                sim.threat += surge;
                stats.surges++;
                if (params.printSurges) {
                    LogResult(stats, TimeStr(sim) + " - Demon Surge Event!  " + surge + " new demons, new threat total " + sim.threat + "\n");
                }
            }
        } else if (event == "terrorist") {
            /* Terrorist attack or enemy raid.  Equivalent for our purposes here */
            if (params.terrorists) {
                let killed = Rand(0, sim.wounded);
                let wounded = Rand(sim.wounded, sim.soldiers);
                
                sim.soldiers -= killed;
                stats.soldiersKilled += killed;
                sim.wounded += wounded;
                
                if (sim.wounded > sim.soldiers) {
                    sim.wounded = sim.soldiers;
                }
                if (params.printTerrorists) {
                    LogResult(stats, TimeStr(sim) + " - Terrorist attack: " + wounded + " wounded, " + killed + " killed.\n");
                }
            }
        } /* else, irrelevant event */
        
        sim.lastEvent = event;
        
        /* Reset event odds */
        sim.eventOdds = 999;
    } else {
        /* No event, increase the odds */
        sim.eventOdds--;
    }
}

function TrainSoldiers(params, sim, stats) {
    if (sim.soldiers >= sim.maxSoldiers) {
        return;
    }
    
    sim.trainingProgress += 100 / sim.trainingTime;
    
    if (sim.trainingProgress >= 100) {
        sim.soldiers++;
        stats.soldiersTrained++;
        sim.trainingProgress = 0;
        if (sim.hellSoldiers < sim.maxHellSoldiers) {
            sim.hellSoldiers++;
        }
    }
}

function HireMercs(params, sim, stats) {
    
    switch (params.hireMercs) {
        case 0: return;
        case 1: /* Volch Script */
            while (MercScriptReqsMet(params, sim, stats) == true) {
                var price = MercPrice(sim, stats)
                sim.money -= price;
                sim.soldiers++;
                if (sim.hellSoldiers < sim.maxHellSoldiers) {
                    sim.hellSoldiers++;
                }
                stats.mercCosts += price;
                sim.mercCounter++;
                stats.mercsHired++;
            }
            break;
        case 2: /* Autoclick */
            sim.clickerCounter++;
            if ((sim.clickerCounter * stats.tickLength) / 1000 >= params.clickerInterval) {
                if (sim.soldiers < sim.maxSoldiers) {
                    var price = MercPrice(sim, stats);
                    if (price <= sim.money) {
                        sim.money -= price;
                        sim.soldiers++;
                        if (sim.hellSoldiers < sim.maxHellSoldiers) {
                            sim.hellSoldiers++;
                        }
                        stats.mercCosts += price;
                        sim.mercCounter++;
                        stats.mercsHired++;
                    }
                }
                sim.clickerCounter = 0;
            }
            break;
        default: break;
    }
    
    if (sim.money < stats.minMoney) {
        stats.minMoney = sim.money;
    }
}

function MercScriptReqsMet(params, sim, stats) {
    var price = MercPrice(sim, stats);  
    var moneyThreshold = params.moneyCap * (params.scriptCapThreshold / 100.0);
    var incomeThreshold = params.moneyIncome * params.scriptIncome;
    
    if (price > sim.money) {
        return false;
    }
    
    if (sim.soldiers >= sim.maxSoldiers) {
        return false;
    }
    
    if (sim.money > moneyThreshold) {
        return true;
    }
    
    if (price  <= incomeThreshold) {
        return true;
    }
}

function MercPrice(sim, stats) {
    var garrison = sim.soldiers - sim.hellSoldiers;
    var price = Math.round((1.24 ** garrison) * 75) - 50;
    if (price > 25000){
        price = 25000;
    }
    if (sim.mercCounter > 0){
        price *= 1.1 ** sim.mercCounter;
    }
    if (params.brute){
        price *= 0.5;
    }
    
    /* Convert to millions */
    price /= 1000000.0;
    
    if (price > stats.mercMaxPrice) {
        stats.mercMaxPrice = price;
    }
    
    return price;
}

function HealSoldiers(params, sim, stats) {
    if (sim.wounded <= 0) {
        return;
    }

    var healed = 1;
    
    if (params.regenerative) {
        healed = 4;
    }
    
    var healCredits = params.hospitals;
    if (params.bacTanks) {
        healCredits *= 2;
    }
    healCredits += params.fibroblast * 2;
    if (params.cannibal) {
        healCredits += 3;
    }
    
    let healCost = params.slowRegen ? 25 : 20;
    healed += Math.floor(healCredits / healCost);
    healCredits = healCredits % healCost;
    if (Rand(0, healCredits) > Rand(0, healCost)) {
        healed++;
    }
    
    sim.wounded -= healed;
    if (sim.wounded < 0) {
        sim.wounded = 0;
    }
}

function RepairSurveyors(params, sim, stats) {
    if (sim.surveyors >= params.surveyors) {
        return;
    }
    let repair = 180;
    if (params.repairDroids > 0) {
        repair *= 0.95 ** params.repairDroids;
        repair = Math.round(repair);
    }
    
    sim.carRepair++;
    if (sim.carRepair >= repair) {
        sim.carRepair = 0;
        sim.surveyors++;
    }
}

function PatrolCasualties(params, sim, stats, demons, ambush) {
    var armor;
    if (ambush) {
        /* Armor is ineffective in an ambush, and demons are stronger */
        armor = 0;
        demons = Math.round(demons * (1 + Math.random() * 3));
    } else {
        armor = params.armorTech;
        if (params.apexPredator) {
            armor = 0;
        }
        if (params.armored) {
            armor += 2;
        }
        if (params.scales) {
            armor += 1;
        }
    }
    
    let casualties = Math.round(Math.log2((demons / params.patrolSize) / (armor || 1))) - Rand(0, armor);
    let dead = 0;
    
    if (casualties > 0) {
        if (casualties > params.patrolSize) {
            casualties = params.patrolSize;
        }
        casualties = Rand((ambush ? 1 : 0), (casualties + 1));
        dead = Rand(0, (casualties + 1));
        let wounded = casualties - dead;
        sim.wounded += wounded;
        sim.soldiers -= dead;
        stats.soldiersKilled += dead;
        if (ambush) {
            stats.ambushDeaths += dead;
        }
    }
    
    return dead;
}
