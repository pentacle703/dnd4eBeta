import { DND4EBETA } from "../config.js";

/**
 * A helper class for building MeasuredTemplates for 4e spells and abilities
 * @extends {MeasuredTemplate}
 */
export default class AbilityTemplate extends MeasuredTemplate {


	static getDistanceCalc(item){

		//use toString() as some older powers formats may still be numerical
		let area = item.system.area?.toString();
		if(!area) return null;
		try{
			area = game.helper.commonReplace(area, item.actor);
			area = Roll.replaceFormulaData(area, item.actor.getRollData(), {missing: 0, warn: true});
			let r = new Roll(area);
			r.evaluate({ async: false });
			return r.total;
		} catch (e) {
			console.error("Problem preparing Area size for ", item.name, e);
			return null;
		}

	}
	/**
	 * A factory method to create an AbilityTemplate instance using provided data from an Item4e instance
	 * @param {Item4e} item                             The Item object for which to construct the template
	 * @return {AbilityTemplate|null}         The template object, or null if the item does not produce a template
	 */
	static fromItem(item) {
		const templateShape = DND4EBETA.areaTargetTypes[item.system.rangeType];
	
		console.log(item);
		let distance = this.getDistanceCalc(item);

		let flags = {dnd4e:{templateType:templateShape}};

		if(item.system.rangeType === "closeBlast" || item.system.rangeType === "rangeBlast") {
			distance *= Math.sqrt(2);
		}
		else if(item.system.rangeType === "rangeBurst") {
			flags.dnd4e.templateType = "rectCenter";
			distance += 0.5;
		}
		else if(item.system.rangeType === "closeBurst") {
			flags.dnd4e.templateType = "rectCenter";
			switch(item.parent.system.details.size) {
				case 'tiny':
				case 'sm':
				case 'med':
					flags.dnd4e.closeBurst = 'med';
					distance += 0.5;
					break;
				case 'lg':
					flags.dnd4e.closeBurst = 'lg';
					distance += 1;
					break;
				case  'huge':
					flags.dnd4e.closeBurst = 'huge';
					distance += 1.5;
					break;
				case 'grg':
					flags.dnd4e.closeBurst = 'grg';
					distance += 2;
					break;
				default:
					distance = Math.sqrt(2) * ( 1 + 2*distance);
			}
		}
		// if(item.system.rangeType === "closeBurst" || item.system.rangeType === "rangeBurst") distance = Math.sqrt(2) * ( 1 + 2*distance);
	
		if ( !templateShape ) return null;

		// Prepare template data
		const templateData = {
			t: templateShape,
			user: game.user.id,
			distance: distance,
			direction: 0,
			x: 0,
			y: 0,
			fillColor: game.user.color,
			flags: flags
		};

		// Additional type-specific data
		switch ( templateShape ) {
			case "cone": // 4e cone RAW should be 53.13 degrees
				templateData.angle = 53.13;
				break;
			case "rect": // 4e rectangular AoEs are always cubes
				templateData.direction = 45;
				break;
			case "ray": // 4e rays are most commonly 1 square (5 ft) in width
				templateData.width = canvas.dimensions.distance;
				break;
			default:
				break;
		}

		// Return the template constructed from the item data
		const cls = CONFIG.MeasuredTemplate.documentClass;
		const template = new cls(templateData, {parent: canvas.scene});
		const object = new this(template);
		object.item = item;
		object.actorSheet = item.actor?.sheet || null;
		return object;
	}

	/* -------------------------------------------- */

	/**
	 * Creates a preview of the spell template
	 */
	drawPreview() {
		const initialLayer = canvas.activeLayer;
		this.draw();
		this.layer.activate();
		this.layer.preview.addChild(this);
		this.activatePreviewListeners(initialLayer);
	}

	/* -------------------------------------------- */

	/**
	 * Activate listeners for the template preview
	 * @param {CanvasLayer} initialLayer    The initially active CanvasLayer to re-activate after the workflow is complete
	 */
	 activatePreviewListeners(initialLayer) {
		const handlers = {};
		let moveTime = 0;

		// Update placement (mouse-move)
		handlers.mm = event => {
			event.stopPropagation();
			let now = Date.now(); // Apply a 20ms throttle
			if ( now - moveTime <= 20 ) return;
			const center = event.data.getLocalPosition(this.layer);
			const snapped = canvas.grid.getSnappedPosition(center.x, center.y, 2);
			this.document.updateSource({x: snapped.x, y: snapped.y});
			this.refresh();
			moveTime = now;
		};

		// Cancel the workflow (right-click)
		handlers.rc = event => {
			this.layer._onDragLeftCancel(event);
			canvas.stage.off("mousemove", handlers.mm);
			canvas.stage.off("mousedown", handlers.lc);
			canvas.app.view.oncontextmenu = null;
			canvas.app.view.onwheel = null;
			initialLayer.activate();
			this.actorSheet?.maximize();
		};

		// Confirm the workflow (left-click)
		handlers.lc = event => {
			handlers.rc(event);
			const destination = canvas.grid.getSnappedPosition(this.document.x, this.document.y, 2);
			this.document.updateSource(destination);
			canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.document.toObject()]);
		};

		// Rotate the template by 3 degree increments (mouse-wheel)
		handlers.mw = event => {
			if ( event.ctrlKey ) event.preventDefault(); // Avoid zooming the browser window
			event.stopPropagation();
			let delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;
			let snap = event.shiftKey ? delta : 5;
			this.document.updateSource({direction: this.document.direction + (snap * Math.sign(event.deltaY))});
			this.refresh();
		};

		// Activate listeners
		canvas.stage.on("mousemove", handlers.mm);
		canvas.stage.on("mousedown", handlers.lc);
		canvas.app.view.oncontextmenu = handlers.rc;
		canvas.app.view.onwheel = handlers.mw;
	}

	static _getCircleSquareShape(wrapper, distance){
		if(this.document.flags.dnd4e?.templateType === "rectCenter" 
		|| (this.document.t === "circle" && ui.controls.activeControl === "measure" && ui.controls.activeTool === "rectCenter" && !this.document.flags.dnd4e?.templateType)) {
			let r = Ray.fromAngle(0, 0, 0, distance),
			dx = r.dx - r.dy,
			dy = r.dy + r.dx;
	
			const points = [
				dx, dy,
				dy, -dx,
				-dx, -dy,
				-dy, dx,
				dx, dy
			];
			return new PIXI.Polygon(points);
		} else {
			return (wrapper(distance))
		}
	}
	
	static _refreshRulerBurst(wrapper){
		if( (this.document.flags.dnd4e?.templateType === "rectCenter"  && this.document.t === "circle")
			|| (this.document.t === "circle" && ui.controls.activeControl === "measure" && ui.controls.activeTool === "rectCenter" && !this.document.flags.dnd4e?.templateType)) {
				let d;
				let text;
	
				if(this.document.flags.dnd4e?.closeBurst){
					switch(this.document.flags.dnd4e?.closeBurst){
						case 'lg':
							d = Math.max(Math.round((this.document.distance -1.0 )* 10) / 10, 0);
							text = `${game.i18n.localize('DND4EBETA.rangeCloseBurst')} ${d} \n(${DND4EBETA.actorSizes[this.document.flags.dnd4e.closeBurst]})`;
							break;
						case 'huge':
							d = Math.max(Math.round((this.document.distance -1.5 )* 10) / 10, 0);
							text = `${game.i18n.localize('DND4EBETA.rangeCloseBurst')} ${d} \n(${DND4EBETA.actorSizes[this.document.flags.dnd4e.closeBurst]})`;
							break;
						case 'grg':
							d = Math.max(Math.round((this.document.distance -2.0 )* 10) / 10, 0);
							text = `${game.i18n.localize('DND4EBETA.rangeCloseBurst')} ${d} \n(${DND4EBETA.actorSizes[this.document.flags.dnd4e.closeBurst]})`;
							break;
						default:
							d = Math.max(Math.round((this.document.distance -0.5 )* 10) / 10, 0);
							text = `${game.i18n.localize('DND4EBETA.rangeCloseBurst')} ${d}`;
					}
				} else {
					d = Math.max(Math.round((this.document.distance -0.5 )* 10) / 10, 0);
					text = `Burst ${d}`;
				}
				this.ruler.text = text;
				this.ruler.position.set(this.ray.dx + 10, this.ray.dy + 5);
		} else {
			return wrapper();
		}
	}


	static async _onDragLeftStart(wrapper, event){
		const {origin, originalEvent} = event.data;
		const tool = game.activeTool;

		if(tool !== "rectCenter"){
			return wrapper(event);
		}

		const previewData = {
			user: game.user.id,
			t: 'circle',
			x: origin.x,
			y: origin.y,
			distance: 1,
			direction: 0,
			fillColor: game.user.color || "#FF0000",
			hidden: originalEvent.altKey,

			flags: {dnd4e:{templateType: "rectCenter"}}
		};
		
		const cls = getDocumentClass("MeasuredTemplate");
		const doc = new cls(previewData, {parent: canvas.scene});
	
		// Create a preview MeasuredTemplate object
		const template = new this.constructor.placeableClass(doc);
		event.data.preview = this.preview.addChild(template);
		return template.draw();
	}
}
